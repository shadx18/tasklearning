# TaskLearning 🎓

Gestor personal de asignaturas universitarias (CUJAE · Ing. Informática) que combina:

- 📚 **Planes de estudio** por asignatura (borradores basados en el currículo cubano, verificables con PDF oficial)
- 🤖 **IA recomendada por asignatura** según el tipo de tarea (Kimi Moderato / ChatGPT Free / Claude Free)
- ⚡ **Tareas delegables a Ollama local** (gratis y privadas: cuestionarios, resúmenes, tarjetas de memoria)
- 📎 **Subida de PDFs** del plan temático (guardados localmente en tu navegador)
- 💾 **Respaldo/exportación** de tus datos en JSON

## Uso

Web pública: https://shadx18.github.io/tasklearning/

Local: ejecuta `serve.ps1` y abre http://localhost:8080

## Flujo de análisis con Kimi

1. Agrega la asignatura en la app
2. Copia la instrucción generada y pégala en Kimi Work
3. Kimi analiza el plan (o el PDF que subas) y actualiza `data/subjects.json`
4. La web pública se actualiza con el análisis

## Estructura

```
index.html      — interfaz
css/style.css   — tema profesional oscuro
js/app.js       — lógica (localStorage + IndexedDB)
data/subjects.json — asignaturas analizadas (mantenida por Kimi)
```

> Nota: los planes temáticos precargados son borradores de referencia.
> Verifica siempre con el plan oficial de tu facultad.
