# TaskLearning

Gestor personal de asignaturas universitarias para CUJAE (Ing. Informatica).

Subes el PDF del plan tematico y la plataforma genera automaticamente:

- Plan tematico detallado por temas
- Repasos enfocados en examen
- Tests interactivos con verificacion y explicaciones
- Ejercicios con soluciones paso a paso
- Resumenes inteligentes por tema
- Recomendacion de IA segun la materia (Kimi / ChatGPT / Claude)

## Uso

**Web:** https://shadx18.github.io/tasklearning/

**Local:**
```bash
python -m http.server 8080
# Abre http://localhost:8080
```

## Flujo

1. En el Panel, escribe el nombre de la asignatura
2. Arrastra o selecciona el PDF del plan tematico
3. La plataforma extrae el texto y genera todo el materia
4. En Asignaturas, toca la tarjeta para ver el detalle con tabs
5. En Respaldo, exporta un JSON para no perder tus datos

## Estructura

```
index.html          Interfaz principal
css/style.css       Tema oscuro profesional
js/app.js           Logica completa (analisis, tests, localStorage)
data/subjects.json  Asignaturas precargadas (opcional)
```

## Tecnologias

- HTML/CSS/JS vanilla (sin frameworks)
- PDF.js v3.11 para extraccion de texto
- localStorage para persistencia
- GitHub Pages para hosting

## Nota

El analisis se realiza por keywords y patrones en el texto del PDF.
No reemplaza la revision manual con el plan oficial de tu facultad.
