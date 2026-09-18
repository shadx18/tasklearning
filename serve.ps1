# Servidor local de prueba para TaskLearning
# Uso: click derecho → "Ejecutar con PowerShell", o:
#   powershell -ExecutionPolicy Bypass -File serve.ps1
Write-Host "Sirviendo TaskLearning en http://localhost:8080  (Ctrl+C para parar)"
python -m http.server 8080
