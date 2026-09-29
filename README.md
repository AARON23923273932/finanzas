# Finanzas

App personal de finanzas en soles para el iPhone. Es una web app instalable (PWA): sin App Store, sin servidor y sin cuenta.

## Cómo se usa

Escribe como hablas y la app lo clasifica sola:

| Escribes | Queda como |
|---|---|
| `almuerzo 18 yape` | Gasto · Comida · Yape |
| `ayer super 85.50 débito` | Gasto · Supermercado · Tarjeta de débito · ayer |
| `+2500 sueldo bcp` | Ingreso · Sueldo · Tarjeta de débito |
| `pasé 100 de yape a efectivo` | Transferencia Yape → Efectivo |
| `retiré 200` | Transferencia Débito → Efectivo |
| `ahorré 300 de yape` | Transferencia Yape → Ahorros |
| `pago tarjeta 450 desde débito` | Pago de la tarjeta de crédito |

También lee las notificaciones de Yape y del banco: cópialas y toca **📋 Pegar**.
Si corriges una categoría, recuerda esas palabras para la próxima vez.

## Instalar en el iPhone

1. Abre la URL de GitHub Pages en **Safari**.
2. Toca **Compartir → Agregar a pantalla de inicio**.
3. Ábrela siempre desde el ícono. Safari y el ícono guardan datos por separado.

## Datos

- Se guardan solo en el dispositivo (`localStorage`). Nada sale del teléfono.
- Respaldo: **Ajustes → Exportar** y guárdalo en iCloud Drive. En el iPad se usa **Importar**.
- Si borras la app de la pantalla de inicio, se borran sus datos. Exporta antes.

## Desarrollo

Es HTML, CSS y JS sin dependencias ni compilación.

```bash
python -m http.server 8765
```

Al publicar cambios, sube `VERSION` en `sw.js` para que el iPhone descargue la versión nueva.
