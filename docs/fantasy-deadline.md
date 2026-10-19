# Cierre automático de Fantasy

Una tarea privada de Supabase Cron revisa cada minuto los plazos vencidos desde su instalación. No depende de tener la web abierta ni de que un administrador publique el partido. El bloqueo de edición por deadline sigue siendo inmediato; la finalización económica puede tardar hasta el siguiente minuto.

La alineación guardada debe contener exactamente cinco jugadores distintos con precio de esa jornada, capitán dentro del quinteto, entrenador habilitado y coste dentro del presupuesto. Las alineaciones válidas puntúan y se cierran con ahorro automático del sobrante, respetando `max_carry` (actualmente 20). Las incompletas o fuera de presupuesto siguen sin puntuar ni generar ahorro: no se inventan elecciones.

Cerrar antes del plazo sigue permitiendo elegir ahorro o Le Gazal. El cierre automático conserva intactos los cierres anticipados, las sesiones, los premios y las asignaciones ya finalizadas. No modifica competiciones históricas. El administrador conserva su RPC de finalización y utiliza la misma implementación privada; no hay un endpoint público de cierre masivo ni suplantación de usuarios.

La creación de la siguiente jornada sigue heredando el saldo final de la anterior. Repetir el trabajo no duplica los apuntes ni las cervezas. Supervisión: `cron.job` y `cron.job_run_details`, trabajo `fantasy-deadline-autoclose`.
