if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('ServiceWorker registado com sucesso com scope: ', registration.scope);
      })
      .catch((error) => {
        console.log('Falha ao registar o ServiceWorker: ', error);
      });
  });
}
