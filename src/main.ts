import { createApp } from 'vue';
import '@fontsource-variable/roboto-flex';
// Inter and Font Awesome are what the blog itself uses; the preview needs both.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './style.css';
import './lib/theme';
import App from './App.vue';

// The preview re-renders on every pause in typing, and each render of a
// `:::github` card asks api.github.com for the repo again. Unauthenticated,
// that's 60 requests an hour. Repo cards don't need to be live while editing,
// so their responses are kept for the session.
const nativeFetch = window.fetch.bind(window);
const repoCache = new Map<string, Promise<Response>>();
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (/^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/?]+$/.test(url) && !init?.method && !(init?.headers as Record<string, string>)?.Authorization) {
    let hit = repoCache.get(url);
    if (!hit) {
      hit = nativeFetch(input, init).then((res) => {
        if (!res.ok) repoCache.delete(url);
        return res;
      });
      repoCache.set(url, hit);
    }
    return hit.then((res) => res.clone());
  }
  return nativeFetch(input, init);
};

createApp(App).mount('#app');
