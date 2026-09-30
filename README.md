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
| `laptop 2400 cmr 12 cuotas` | Compra en la CMR en 12 cuotas con la TEA de la tarjeta |
| `zapatillas 300 en 3 cuotas sin intereses` | Compra en 3 cuotas sin intereses |

También lee las notificaciones de Yape y del banco: cópialas y toca **📋 Pegar**.
Si corriges una categoría, recuerda esas palabras para la próxima vez.

## Tarjetas de crédito

En **Cuentas**, al tocar la tarjeta, se configura con la línea, el día de cierre, el día de pago y
la TEA. También se carga lo que debes hoy: el último estado de cuenta, los consumos todavía no
facturados y las compras en cuotas que ya vienes pagando.

Con eso la ficha de la tarjeta muestra:

- Cuánto pagar ahora y hasta cuándo, y el monto del próximo estado de cuenta.
- La deuda total y la línea disponible.
- Las cuotas vigentes, con cuántas faltan.
- Un **simulador de cuotas**: la cuota mensual, los intereses y cómo quedarían tus pagos mes a
  mes con y sin esa compra.

Las cuotas usan cuota fija con la TEA convertida a tasa mensual. Es una aproximación: el banco
puede sumar seguro de desgravamen.

## Instalar en el iPhone

1. Abre la URL de GitHub Pages en **Safari**.
2. Toca **Compartir → Agregar a pantalla de inicio**.
3. Ábrela siempre desde el ícono. Safari y el ícono guardan datos por separado.

## Sincronizar iPhone y iPad

En **Ajustes → Sincronización**, cada dispositivo se conecta al repositorio privado `finanzas-datos`
con un código de acceso de GitHub y una contraseña de cifrado. Hay que usar el mismo código y la
misma contraseña en los dos.

- Los datos se cifran en el dispositivo (PBKDF2 + AES-GCM) antes de subir. GitHub solo guarda
  texto ilegible, y la contraseña nunca sale del teléfono.
- Cada registro guarda la hora de su último cambio. Al sincronizar gana el cambio más reciente,
  registro por registro, y lo borrado queda borrado. Si se registra algo en los dos dispositivos,
  se conservan las dos cosas.
- Se sincroniza al abrir la app, al volver a ella y un momento después de cada cambio.

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
