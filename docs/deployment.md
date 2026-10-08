# Dominio y publicación

El despliegue actual continúa en https://davidperez3.github.io/gazalbide-stats/. No se ha elegido ni configurado un dominio propio.

Cuando tengas el dominio:

1. En las variables del repositorio configura `VITE_APP_BASE=/` y `VITE_PUBLIC_SITE_URL=https://TU_DOMINIO/`. Deben coincidir exactamente y usar HTTPS. El build generará CNAME, sitemap, robots y metadatos para ese origen.
2. Configura ese dominio en GitHub Pages y sus registros DNS siguiendo las instrucciones que muestra GitHub para tu dominio. Activa HTTPS cuando esté disponible.
3. En Supabase Auth actualiza Site URL y añade el nuevo origen/ruta a las URLs de redirección permitidas. Mantén la antigua si todavía se usa. Revisa también los orígenes autorizados de los proveedores OAuth configurados.
4. Ejecuta Deploy to GitHub Pages y prueba login, recuperación, enlaces, instalación y notificaciones desde el dominio nuevo.

La configuración local está documentada en `.env.example`. `npm run check` valida código, pruebas y build. El manifiesto y el service worker usan rutas relativas al origen/base publicados. No se compran dominios ni se modifican DNS automáticamente.
