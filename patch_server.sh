cat << 'INNER_EOF' >> server/server.js

// Lida com erros não tratados para evitar que o processo morra em silêncio ou deixe o banco em estado inconsistente
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  server
    .stop()
    .catch(() => {})
    .finally(() => {
      server.db.close();
      process.exit(1);
    });
});
INNER_EOF
