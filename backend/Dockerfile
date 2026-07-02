FROM eclipse-temurin:21-jdk AS build

WORKDIR /app
COPY . .
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw && ./mvnw clean package -DskipTests

FROM eclipse-temurin:21-jre

WORKDIR /app
ENV SERVER_PORT=8888
COPY --from=build /app/target/demo-1.0.0.jar app.jar

EXPOSE 8888
ENTRYPOINT ["java", "-jar", "app.jar"]
