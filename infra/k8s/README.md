# Ticksy Kubernetes (k8s) Deployment Guide

This directory contains the production-grade Kubernetes architecture for the **Ticksy** event ticketing platform, packaged using **Kustomize** for one-command deployment.

---

## 1. Architecture Highlights

1. **Namespace Isolation**:
   - Everything runs isolated in the dedicated namespace: `ticksy`.
2. **Multi-Container Pods (Course Assignment Requirement)**:
   - Each microservice pod is a **multi-container pod** (`2/2` containers running):
     - **Main Application Container**: The service process (`auth-service`, `catalog-service`, `booking-service`, `payment-service`, `ledger-service`, `notification-service`, `gateway`).
     - **Logging Sidecar Container** (`log-sidecar`): Mounted via a shared `emptyDir` volume `/var/log/ticksy` continuously tailing and streaming logs.
   - **Init Containers**:
     - Pre-flight readiness checks (`wait-for-dependencies`) using lightweight probes to ensure dependent databases (Postgres, MySQL, Mongo, Redis, RabbitMQ) are reachable before starting the application container.
3. **Internal Service Discovery & DNS**:
   - Native Kubernetes DNS (`kube-dns` / `CoreDNS`) enables direct service-to-service resolution:
     - `http://auth-service:4001`
     - `http://catalog-service:4002` (and gRPC on `catalog-service:50052`)
     - `http://booking-service:4003`
     - `http://payment-service:4004` (and gRPC on `payment-service:50054`)
     - `http://ledger-service:4005`
     - `http://notification-service:4006`
     - `http://gateway:8080`
4. **Stateful Workloads**:
   - Databases and message brokers are deployed as `StatefulSet` with `PersistentVolumeClaim` (PVC):
     - `auth-db` (Postgres 16)
     - `catalog-mongo` (MongoDB 8 single-node replica set `rs0`)
     - `booking-db` (MySQL 8)
     - `booking-redis`, `ledger-redis`, `notification-redis` (Redis 7)
     - `payment-db` (Postgres 16)
     - `ledger-kurrentdb` (KurrentDB / EventStore)
     - `notification-rabbitmq` (RabbitMQ 3)
5. **Autoscaling (HPA)**:
   - `HorizontalPodAutoscaler` configured for `booking-service` (scales 1 to 5 replicas based on CPU/memory utilization during flash sales).
6. **Ingress & External Access**:
   - Ingress routing rules for `ticksy.local`.
   - NodePort service for the `frontend` on port `30080` for immediate browser access in Minikube.

---

## 2. Directory Layout

```
infra/k8s/
├── kustomization.yaml         # Root Kustomization uniting all components
├── namespace.yaml             # 'ticksy' namespace
├── deploy.sh                  # Interactive one-step helper script
├── configmaps/
│   ├── kustomization.yaml
│   └── app-config.yaml        # Global shared configuration
├── secrets/
│   ├── kustomization.yaml
│   ├── app-secrets.yaml       # Database & broker credentials
│   └── auth-keys-secret.yaml  # RSA public & private key pair for JWT / JWKS
├── databases/
│   ├── kustomization.yaml
│   ├── auth-db.yaml           # PostgreSQL (Auth)
│   ├── catalog-mongo.yaml     # MongoDB 8 (Catalog)
│   ├── booking-db.yaml        # MySQL 8 (Booking)
│   ├── booking-redis.yaml     # Redis (Holds cache)
│   ├── payment-db.yaml        # PostgreSQL (Payment)
│   ├── ledger-kurrentdb.yaml  # KurrentDB (Ledger EventStore)
│   ├── ledger-redis.yaml      # Redis (Ledger read-model)
│   ├── notification-redis.yaml# Redis (Notification cache)
│   └── notification-rabbitmq.yaml # RabbitMQ (Delay queues & timers)
├── services/
│   ├── kustomization.yaml
│   ├── auth-service.yaml      # Auth microservice (Multi-container)
│   ├── catalog-service.yaml   # Catalog microservice (Multi-container)
│   ├── booking-service.yaml   # Booking microservice (Multi-container)
│   ├── payment-service.yaml   # Payment microservice (Multi-container)
│   ├── ledger-service.yaml    # Ledger microservice (Multi-container)
│   ├── notification-service.yaml # Notification microservice (Multi-container)
│   └── gateway.yaml           # API Gateway (Multi-container)
├── frontend/
│   ├── kustomization.yaml
│   └── frontend.yaml          # React/Vite UI with Nginx proxy
├── ingress/
│   ├── kustomization.yaml
│   └── ingress.yaml           # Ingress controller routing
└── hpa/
    ├── kustomization.yaml
    └── booking-hpa.yaml       # Booking HPA definition
```

---

## 3. How to Deploy to Minikube

### Step 1: Start Minikube (with Ingress & Metrics Server)
```bash
minikube start --cpus=4 --memory=8192
minikube addons enable ingress
minikube addons enable metrics-server
```

### Step 2: Load Local Docker Images into Minikube
Because your images are built locally on your Docker daemon, load them into Minikube:
```bash
minikube image load ticksy-auth-service:latest
minikube image load ticksy-catalog-service:latest
minikube image load ticksy-booking-service:latest
minikube image load ticksy-payment-service:latest
minikube image load ticksy-ledger-service:latest
minikube image load ticksy-notification-service:latest
minikube image load ticksy-gateway:latest
minikube image load ticksy-frontend:latest
```
*(Tip: Or execute `./infra/k8s/deploy.sh` which handles image loading automatically).*

### Step 3: Deploy with One Command
Run:
```bash
kubectl apply -k infra/k8s/
```
Or execute the helper script:
```bash
./infra/k8s/deploy.sh
```

---

## 4. Verification and Monitoring

Check the status of all pods:
```bash
kubectl get pods -n ticksy
```
You will observe the microservices running with **multi-container pods** (`2/2` Ready):
```text
NAME                                    READY   STATUS    RESTARTS   AGE
auth-db-0                               1/1     Running   0          2m
auth-service-7848f868c6-mvd6k           2/2     Running   0          90s
booking-db-0                            1/1     Running   0          2m
booking-redis-55f69f886f-qg7kx          1/1     Running   0          2m
booking-service-67448d447d-8l2k1        2/2     Running   0          90s
catalog-mongo-0                         1/1     Running   0          2m
catalog-service-897dbfc7c-7x92n         2/2     Running   0          90s
frontend-7df5bb9599-4s89j               1/1     Running   0          90s
gateway-5cf7fb45c4-729jx                2/2     Running   0          90s
...
```

Inspect the logs from the sidecar container:
```bash
kubectl logs -n ticksy deployment/booking-service -c log-sidecar
```

Inspect horizontal pod autoscaler:
```bash
kubectl get hpa -n ticksy
```

---

## 5. Accessing the Application

### Option A: Via Minikube Service URL (Recommended)
```bash
minikube service frontend -n ticksy
```
This automatically opens your browser to the running frontend UI.

### Option B: Via NodePort (Port 30080)
```bash
http://<MINIKUBE_IP>:30080
```
(Find Minikube IP with `minikube ip`).

### Option C: Via Ingress
Add this entry to your `/etc/hosts`:
```
$(minikube ip) ticksy.local
```
Then navigate to: `http://ticksy.local`

---

## 6. Teardown
To remove all workloads and free resources with one command:
```bash
kubectl delete -k infra/k8s/
```
