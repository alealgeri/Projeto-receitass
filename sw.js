/*
 * Receitas com Custo — service worker.
 * Faz o app abrir sem internet. Arquivos do próprio app: rede primeiro (sempre a versão
 * mais nova quando há conexão) e cópia guardada quando não há. Fontes e bibliotecas da
 * CDN, que têm versão fixa: cópia guardada primeiro. Chamadas às APIs (Supabase,
 * Anthropic) nunca passam pelo cache.
 */
const CACHE_APP = 'receitas-app-v1';
const CACHE_EXTERNO = 'receitas-externo-v1';

const ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/estilo.css',
  './js/calculos.js',
  './js/leitura.js',
  './js/dados.js',
  './js/config.js',
  './js/nuvem.js',
  './js/app.js',
  './icones/icone-192.png',
  './icones/icone-512.png',
  './icones/apple-touch-icon.png',
  './icones/favicon-64.png',
];

const EXTERNOS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE_APP).then((cache) => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_APP && n !== CACHE_EXTERNO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);

  if (url.origin === self.location.origin) {
    evento.respondWith(redePrimeiro(pedido));
  } else if (EXTERNOS.includes(url.hostname)) {
    evento.respondWith(cachePrimeiro(pedido));
  }
});

async function redePrimeiro(pedido) {
  const cache = await caches.open(CACHE_APP);
  try {
    const resposta = await fetch(pedido);
    if (resposta.ok) cache.put(pedido, resposta.clone());
    return resposta;
  } catch (erro) {
    const guardada = await cache.match(pedido, { ignoreSearch: true });
    if (guardada) return guardada;
    if (pedido.mode === 'navigate') return cache.match('./index.html');
    throw erro;
  }
}

async function cachePrimeiro(pedido) {
  const cache = await caches.open(CACHE_EXTERNO);
  const guardada = await cache.match(pedido);
  if (guardada) return guardada;
  const resposta = await fetch(pedido);
  if (resposta.ok || resposta.type === 'opaque') cache.put(pedido, resposta.clone());
  return resposta;
}
