# Stage 1: Build the application with Maven
FROM maven:3.9.9-eclipse-temurin-21 AS builder

WORKDIR /repo/services/booking

# Copy pom, proto definitions, and source code
COPY services/booking/pom.xml .
COPY shared/proto /repo/shared/proto
COPY services/booking/src ./src

# Build directly using Docker BuildKit cache mount for ~/.m2
RUN --mount=type=cache,target=/root/.m2 mvn package -DskipTests

# Stage 2: Runtime container with minimal JRE
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat

# Create non-root user for security
RUN addgroup -S ticksy && adduser -S ticksy -G ticksy

# Copy jar from builder stage
COPY --from=builder /repo/services/booking/target/booking-service-*.jar app.jar

# Set permissions
RUN chown -R ticksy:ticksy /app

USER ticksy

EXPOSE 4003

ENV PORT=4003
ENV JAVA_OPTS="-XX:+UseG1GC -XX:MaxRAMPercentage=75.0"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
