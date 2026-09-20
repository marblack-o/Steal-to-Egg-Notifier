# Steal to Egg Notifier – Bot

Detecta huevos de **SenZ V2** y actualiza `data/latest.json` en tu repositorio de GitHub.

## 1. Crear el token de GitHub

1. Ve a: https://github.com/settings/tokens
2. **Generate new token (classic)**
3. Nombre: `egg-notifier`
4. Marca el permiso: **`repo`** (todo el grupo)
5. Generate token → **cópialo** (solo se muestra una vez)

## 2. Configurar el bot

```bash
cd bot
npm install
cp .env.example .env
```

Edita el archivo `.env`:

```
DISCORD_TOKEN=tu_token_del_bot_de_discord
GITHUB_TOKEN=tu_token_de_github
```

## 3. Crear la carpeta data en el repo

En tu repositorio de GitHub crea la carpeta `data` y sube el archivo `latest.json` (está en el zip).

O créalo vacío con este contenido:

```json
{
  "updatedAt": 0,
  "eggs": []
}
```

## 4. Arrancar

```bash
npm start
```

Si todo sale bien verás:

```
✅ Bot conectado como TuBot#1234
👀 Canal: 1544813161037963315
🎯 SenZ V2: 1409108089705332836
📦 JSON: data/latest.json
```

Cuando SenZ V2 publique un huevo, el bot actualizará el JSON y la app de todos se actualizará sola en unos segundos.

## Importante

- **Nunca subas el archivo `.env`** a GitHub
- El token de GitHub debe tener permiso `repo`
- Activa **MESSAGE CONTENT INTENT** en el Discord Developer Portal
