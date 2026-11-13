import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { execFileSync } from 'child_process'

// Vendors em chunks estáveis: mudam pouco entre publicações (cache longo) e baixam em paralelo.
// Só o que é de fato compartilhado; o resto o Rollup coloca junto da tela que usa.
const VENDOR_CHUNKS = [
  // Miúdos usados pelo shell e pelas telas públicas: ficam fora dos chunks pesados para a
  // landing não arrastar recharts/radix só por causa de clsx ou do Slot do botão.
  ['vendor-ui', ['/node_modules/clsx/', '/node_modules/tailwind-merge/', '/node_modules/class-variance-authority/', '/node_modules/sonner/', '/node_modules/@radix-ui/react-slot/', '/node_modules/@radix-ui/react-compose-refs/', '/node_modules/@radix-ui/react-label/', '/node_modules/@radix-ui/react-primitive/']],
  ['vendor-shared', ['/node_modules/@babel/runtime/', '/node_modules/memoize-one/', '/node_modules/tiny-invariant/', '/node_modules/use-sync-external-store/', '/node_modules/prop-types/', '/node_modules/react-is/', '/node_modules/object-assign/']],
  ['vendor-react', ['/node_modules/react/', '/node_modules/react-dom/', '/node_modules/scheduler/', '/node_modules/react-router/', '/node_modules/react-router-dom/', '/node_modules/@remix-run/router/']],
  ['vendor-query', ['/node_modules/@tanstack/']],
  ['vendor-motion', ['/node_modules/framer-motion/', '/node_modules/motion-dom/', '/node_modules/motion-utils/']],
  ['vendor-charts', ['/node_modules/recharts/', '/node_modules/d3-', '/node_modules/victory-vendor/', '/node_modules/recharts-scale/', '/node_modules/react-smooth/', '/node_modules/decimal.js-light/', '/node_modules/eventemitter3/', '/node_modules/lodash/', '/node_modules/internmap/']],
  ['vendor-dnd', ['/node_modules/@hello-pangea/', '/node_modules/css-box-model/', '/node_modules/raf-schd/', '/node_modules/redux/', '/node_modules/react-redux/', '/node_modules/use-memo-one/']],
  ['vendor-date', ['/node_modules/date-fns/']],
  ['vendor-icons', ['/node_modules/lucide-react/']],
  ['vendor-radix', ['/node_modules/@radix-ui/', '/node_modules/@floating-ui/', '/node_modules/react-remove-scroll', '/node_modules/react-style-singleton/', '/node_modules/use-callback-ref/', '/node_modules/use-sidecar/', '/node_modules/aria-hidden/', '/node_modules/get-nonce/', '/node_modules/detect-node-es/']],
]

function manualChunks(id) {
  const normalized = id.split(path.sep).join('/')
  if (!normalized.includes('/node_modules/')) return undefined
  for (const [name, needles] of VENDOR_CHUNKS) {
    if (needles.some((needle) => normalized.includes(needle))) return name
  }
  return undefined
}

/*
 * Landing e login são chunks próprios, mas o import() deles só sai depois que o index executa.
 * Para o visitante sem sessão (o teste do Google), este script inline pede o chunk certo já no
 * parse do HTML, em paralelo com o resto. A pista de sessão replica src/lib/sessionHint.js.
 */
function publicRoutePreload() {
  const pages = { '/': '/src/pages/Landing.jsx', '/entrar': '/src/pages/Login.jsx' }
  return {
    name: 'praxis-public-route-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html
        const chunks = Object.values(ctx.bundle).filter((c) => c.type === 'chunk')
        const byFile = new Map(chunks.map((c) => [c.fileName, c]))
        const entry = chunks.find((c) => c.isEntry)
        const alreadyLoaded = new Set([entry.fileName, ...entry.imports])
        const map = {}
        for (const [route, page] of Object.entries(pages)) {
          const chunk = chunks.find((c) => c.facadeModuleId?.split(path.sep).join('/').endsWith(page))
          if (!chunk) continue
          const files = new Set()
          const visit = (file) => {
            if (files.has(file) || alreadyLoaded.has(file)) return
            files.add(file)
            byFile.get(file)?.imports.forEach(visit)
          }
          visit(chunk.fileName)
          map[route] = [...files].map((f) => `/${f}`)
        }
        const script = `<script>(function(){try{var m=${JSON.stringify(map)}[location.pathname];if(!m)return;var s=localStorage;if(s.getItem('praxis:session-hint')==='1')return;for(var i=0;i<s.length;i++){var k=s.key(i)||'';if(k.indexOf('praxis:offline:')===0||k.indexOf('forja:offline:')===0)return}m.forEach(function(h){var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href=h;document.head.appendChild(l)})}catch(e){}})()</script>`
        // Antes do CSS: script inline depois de um <link rel=stylesheet> espera o CSS baixar.
        return html.replace(/(\n\s*)<script type="module"/, `$1${script}$1<script type="module"`)
      },
    },
  }
}

/** Commit do build: vai no cabeçalho X-Praxis-Client e casa a chamada com a versão do front. */
function buildVersion() {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA || process.env.PRAXIS_BUILD
  if (fromEnv) return String(fromEnv).slice(0, 7)
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: __dirname, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'dev'
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error',
  define: {
    'import.meta.env.VITE_PRAXIS_BUILD': JSON.stringify(buildVersion()),
  },
  plugins: [
    react(),
    publicRoutePreload(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
