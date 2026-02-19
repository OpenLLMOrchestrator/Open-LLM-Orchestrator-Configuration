# Single image: frontend (SPA) + backend (Spring Boot). Build from repo root.
# docker build -t olo-config .

# ---- Frontend ----
FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ---- Backend (includes frontend static in JAR) ----
FROM maven:3.9-eclipse-temurin-17-alpine AS backend
WORKDIR /build
COPY pom.xml .
COPY engine-config engine-config
COPY backend backend
# Embed frontend build so the JAR serves the SPA from /
COPY --from=frontend /app/dist backend/src/main/resources/static

RUN mvn install -pl backend -am -DskipTests -q

# ---- Runtime ----
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=backend /build/backend/target/*.jar app.jar
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "app.jar"]
