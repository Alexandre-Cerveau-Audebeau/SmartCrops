FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ["SmartCrops.Api/SmartCrops.Api.csproj", "SmartCrops.Api/"]
COPY ["SmartCrops.Core/SmartCrops.Core.csproj", "SmartCrops.Core/"]
COPY ["SmartCrops.Infrastructure/SmartCrops.Infrastructure.csproj", "SmartCrops.Infrastructure/"]
RUN dotnet restore "SmartCrops.Api/SmartCrops.Api.csproj"

COPY . .
WORKDIR "/src/SmartCrops.Api"
RUN dotnet publish "SmartCrops.Api.csproj" -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "SmartCrops.Api.dll"]
