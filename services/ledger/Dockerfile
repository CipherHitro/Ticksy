# Multi-stage Dockerfile for Ledger Service (.NET 10)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Prevent NuGet hangs and timeouts in Docker
ENV NUGET_CERT_REVOCATION_MODE=offline
ENV DOTNET_NUGET_SIGNATURE_VERIFICATION=false

# Copy ONLY the API project file for caching layer
COPY services/ledger/src/Ticksy.Ledger.Api/Ticksy.Ledger.Api.csproj services/ledger/src/Ticksy.Ledger.Api/

# Restore dependencies
RUN dotnet restore services/ledger/src/Ticksy.Ledger.Api/Ticksy.Ledger.Api.csproj --disable-parallel || \
    dotnet restore services/ledger/src/Ticksy.Ledger.Api/Ticksy.Ledger.Api.csproj

# Copy source code and publish
COPY services/ledger/src/ services/ledger/src/
RUN dotnet publish services/ledger/src/Ticksy.Ledger.Api/Ticksy.Ledger.Api.csproj \
    -c Release \
    -o /app/publish \
    /p:UseAppHost=false

# Stage 2: Runtime image (non-root)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_ENVIRONMENT=Production
ENV PORT=4005

COPY --from=build /app/publish .

# Run as non-root user (built into Microsoft .NET images)
USER app

EXPOSE 4005

ENTRYPOINT ["dotnet", "Ticksy.Ledger.Api.dll"]
