const { contextBridge } = require('electron');
const states = {
  summarize: { seq: 1, mode: 'summarize', state: 'done', bullets: ['Lãi suất giữ nguyên.', 'Dự báo ổn định.'], ai: false, lang: 'vi' },
  ask: { seq: 1, mode: 'ask', question: 'lãi suất?', state: 'done', found: true, answer: 'Giữ nguyên.', passages: ['Ngân hàng Nhà nước giữ nguyên lãi suất điều hành.'], ai: true, model: 'm1', remote: 'api.example.com', lang: 'en' },
  translate: { seq: 1, mode: 'translate', state: 'done', translated: 12, target: 'Vietnamese', lang: 'en' }
};
contextBridge.exposeInMainWorld('agent', {
  platform: 'darwin', onState() {}, onDl() {}, onLang() {},
  modelMenu: () => {}, onModel: () => {}, onThread: () => {}, onCtx: () => {}, chats: { goto() {}, addHere() {}, drop() {}, list: async () => [], open() {}, remove() {}, fresh() {} },
  onPage: (fn) => setTimeout(() => fn(states[new URLSearchParams(location.search).get('s')]), 50),
  pageDo() {}, actStop() {}, copy() {}, pageView() {}, pageShow() {}, decide() {}, close() {}, dlStart() {}, dlReveal() {}
});
