# Le Gazal

`Le Gazal` esta montado como feature aislado para poder cambiar mas adelante la capa de economia sin tocar el motor de slots ni la UI.

Punto de extension previsto:

- `DemoEconomyAdapter`: saldo ilimitado, sin persistencia externa.
- `FantasyEconomyAdapter`: futura integracion con saldo real, validacion fantasy y registro en Supabase.

Hoy solo existe el comportamiento demo dentro de `useLeGazalDemo.js`. El siguiente paso natural seria extraer la gestion de saldo y costes a un adaptador inyectable, manteniendo `slotEngine.js` como motor puro.
