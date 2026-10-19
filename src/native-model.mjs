import {Headunit} from './model.mjs';

const visibleRoutes = new Set(['home','dashboard','phones','settings','audio','vehicle','projection','camera','cluster','disconnected']);
const navigableRoutes = new Set(['home','dashboard','phones','settings','audio','vehicle','projection']);

/** Browser-side projection of the privileged, authoritative host view. */
export class NativeHeadunit extends Headunit {
  constructor(storage, bridge, onChange = () => {}) {
    super(storage);
    this.bridge = bridge;
    this.onChange = onChange;
    this.state.screen = 'disconnected';
    this.state.phones = [];
    this.state.activePhone = null;
    this.state.connected = false;
    this.state.front = 'livi';
    this.state.notice = null;
    this.state.commandError = false;
    this.pendingPhone = null;
    this.choiceGeneration = 0;
    this.revision = 0;
  }

  async start() {
    this.unsubscribe = this.bridge.onView(view => this.applyView(view));
    const before = this.revision;
    try {
      const initial = await this.bridge.getView();
      if (this.revision === before) this.applyView(initial);
    } catch {
      this.state.commandError = true;
      this.onChange();
    }
  }

  stop() { this.unsubscribe?.(); this.unsubscribe = null; this.pendingPhone = null; }

  applyView(view) {
    this.revision++;
    const connected = view?.connected === true;
    const phones = connected && Array.isArray(view.phones) ? view.phones.filter(p =>
      p && typeof p.id === 'string' && p.id.length > 0 && p.id.length <= 256
    ).map(p => ({id:p.id, name:typeof p.name === 'string' ? p.name : 'Phone',
      status:['active','available','offline'].includes(p.status) ? p.status : 'offline', active:p.status === 'active'})) : [];
    this.state.connected = connected;
    this.state.phones = phones;
    this.state.activePhone = phones.find(p => p.active)?.id ?? null;
    this.state.front = connected && ['livi','projection','camera','cluster'].includes(view.front) ? view.front : 'livi';
    this.state.screen = connected && visibleRoutes.has(view.route) ? view.route : 'disconnected';
    if (view.route === 'dashboard') this.state.homeMode = 'dashboard';
    else if (view.route === 'home') this.state.homeMode = 'apps';
    this.state.notice = view.notice === 'projection-reconnecting' ? view.notice : null;
    if (!connected) this.pendingPhone = null;
    if (this.pendingPhone && this.state.activePhone === this.pendingPhone) {
      this.pendingPhone = null;
      this.command('navigate','projection');
    }
    this.onChange();
  }

  command(method, value, onFailure = () => {}) {
    try {
      Promise.resolve(this.bridge[method](value)).catch(() => {
        onFailure();
        this.state.commandError = true;
        this.onChange();
      });
    } catch {
      onFailure();
      this.state.commandError = true;
      this.onChange();
    }
  }

  navigate(route) {
    if (!navigableRoutes.has(route)) throw Error('Unknown route');
    this.pendingPhone = null;
    this.choiceGeneration++;
    this.state.commandError = false;
    this.command('navigate',route);
  }

  home() { this.navigate('home'); }

  setHomeMode(mode) {
    if (!['apps','dashboard'].includes(mode)) throw Error('Unknown Home layout');
    this.navigate(mode === 'apps' ? 'home' : 'dashboard');
  }

  connect(id) {
    if (!this.state.connected || !this.state.phones.some(p => p.id === id)) throw Error('Unknown phone');
    if (this.state.activePhone === id) {
      this.navigate('projection');
      return;
    }
    this.pendingPhone = id;
    const generation = ++this.choiceGeneration;
    this.state.commandError = false;
    this.command('selectPhone',id,() => {
      if (this.choiceGeneration === generation) this.pendingPhone = null;
    });
  }
}
