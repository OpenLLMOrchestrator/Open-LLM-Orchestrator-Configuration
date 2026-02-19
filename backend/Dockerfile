# Multi-stage: build from repo root so engine-config is available.
# Build: docker compose build backend  (context is repo root)

FROM maven:3.9-eclipse-temurin-17-alpine AS build
WORKDIR /build
COPY pom.xml .
COPY engine-config engine-config
COPY backend backend

RUN mvn install -pl backend -am -DskipTests -q

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /build/backend/target/*.jar app.jar
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "app.jar"]
