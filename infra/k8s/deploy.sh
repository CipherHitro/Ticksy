#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "           Ticksy Platform - Kubernetes Deployment       "
echo "=========================================================="

# Check kubectl
if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl is not installed or not in PATH."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if minikube is running (optional warning)
if command -v minikube &> /dev/null; then
    if ! minikube status | grep -q "Running"; then
        echo "Notice: Minikube is not currently running."
        echo "If deploying to Minikube, please run 'minikube start' first."
        read -p "Do you want to start Minikube now? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            minikube start --cpus=4 --memory=8192
            minikube addons enable ingress
            minikube addons enable metrics-server
        fi
    fi

    # Option to load local docker images into Minikube
    read -p "Do you want to load local Ticksy Docker images into Minikube? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Loading images into Minikube cluster (this may take a couple minutes)..."
        IMAGES=(
            "ticksy-auth-service:latest"
            "ticksy-catalog-service:latest"
            "ticksy-booking-service:latest"
            "ticksy-payment-service:latest"
            "ticksy-ledger-service:latest"
            "ticksy-notification-service:latest"
            "ticksy-gateway:latest"
            "ticksy-frontend:latest"
        )
        for img in "${IMAGES[@]}"; do
            echo "-> Loading $img into Minikube..."
            minikube image load "$img" || true
        done
        echo "Images loaded successfully!"
    fi
fi

echo ""
echo "Setting up namespace 'ticksy' and secure secrets..."
kubectl create namespace ticksy --dry-run=client -o yaml | kubectl apply -f -

if [ ! -f "$SCRIPT_DIR/secrets/app-secrets.yaml" ]; then
    echo "Initializing $SCRIPT_DIR/secrets/app-secrets.yaml from template..."
    cp "$SCRIPT_DIR/secrets/app-secrets.example.yaml" "$SCRIPT_DIR/secrets/app-secrets.yaml"
fi

AUTH_KEYS_DIR="$SCRIPT_DIR/../../services/auth/keys"
if [ ! -f "$AUTH_KEYS_DIR/private.pem" ]; then
    echo "Notice: $AUTH_KEYS_DIR/private.pem not found. Generating a local RSA key pair..."
    mkdir -p "$AUTH_KEYS_DIR"
    openssl genrsa -out "$AUTH_KEYS_DIR/private.pem" 2048
    openssl rsa -in "$AUTH_KEYS_DIR/private.pem" -pubout -out "$AUTH_KEYS_DIR/public.pem"
fi

echo "Injecting auth-keys-secret securely into Kubernetes cluster..."
kubectl create secret generic auth-keys-secret -n ticksy \
  --from-file=private.pem="$AUTH_KEYS_DIR/private.pem" \
  --from-file=public.pem="$AUTH_KEYS_DIR/public.pem" \
  --dry-run=client -o yaml | kubectl apply -f -

echo ""
echo "Applying Kubernetes manifests via Kustomize in one command..."
kubectl apply -k "$SCRIPT_DIR"

echo ""
echo "=========================================================="
echo "Deployment applied! Monitoring rollout in namespace 'ticksy'..."
echo "=========================================================="
echo "To watch pods in real time: kubectl get pods -n ticksy -w"
echo "To open the frontend in browser: minikube service frontend -n ticksy"
echo "Or access directly via NodePort: http://$(minikube ip 2>/dev/null || echo 'localhost'):30080"
