# Stage 1: Build the application with Maven
FROM maven:3.9.9-eclipse-temurin-21-alpine AS builder

WORKDIR /app

# Cache dependencies
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copy source code and build
COPY src ./src
RUN mvn clean package -DskipTests

# Stage 2: Runtime container with minimal JRE
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -S ticksy && adduser -S ticksy -G ticksy

# Copy jar from builder stage
COPY --from=builder /app/target/booking-service-*.jar app.jar

# Set permissions
RUN chown -R ticksy:ticksy /app

USER ticksy

EXPOSE 4003

ENV PORT=4003
ENV JAVA_OPTS="-XX:+UseG1GC -XX:MaxRAMPercentage=75.0"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
