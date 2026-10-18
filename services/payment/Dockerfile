# Multi-stage Dockerfile for Payment Service (.NET 10)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Prevent NuGet hangs and timeouts in Docker:
# 1. Skip online certificate revocation checks (often times out on container networks)
# 2. Skip signature verification round-trips
ENV NUGET_CERT_REVOCATION_MODE=offline
ENV DOTNET_NUGET_SIGNATURE_VERIFICATION=false

# Copy proto definitions (required by csproj for gRPC compilation)
COPY shared/proto/ shared/proto/

# Copy ONLY the API project file (do NOT restore test/code coverage dependencies in production)
COPY services/payment/src/Ticksy.Payment.Api/Ticksy.Payment.Api.csproj services/payment/src/Ticksy.Payment.Api/

# Restore dependencies for the API project only (sequential downloads + retry to prevent socket drops)
RUN dotnet restore services/payment/src/Ticksy.Payment.Api/Ticksy.Payment.Api.csproj --disable-parallel || \
    dotnet restore services/payment/src/Ticksy.Payment.Api/Ticksy.Payment.Api.csproj

# Copy source code and publish
COPY services/payment/src/ services/payment/src/
RUN dotnet publish services/payment/src/Ticksy.Payment.Api/Ticksy.Payment.Api.csproj \
    -c Release \
    -o /app/publish \
    /p:UseAppHost=false

# Stage 2: Runtime image (non-root)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_ENVIRONMENT=Production
ENV Ports__Http=4004
ENV Ports__Grpc=50054

COPY --from=build /app/publish .

# Run as non-root user (built into Microsoft .NET images)
USER app

EXPOSE 4004 50054

ENTRYPOINT ["dotnet", "Ticksy.Payment.Api.dll"]
