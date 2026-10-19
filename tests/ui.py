"""Chromium UI checks. Native scenarios inject a test bridge, never LIVI hardware."""
from playwright.sync_api import sync_playwright, expect
from pathlib import Path

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, chromium_sandbox=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 720}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8095')
    page.locator('main [data-action="phones"]').click()
    page.get_by_role('button', name='Connect Driver’s iPhone', exact=True).click()
    expect(page.get_by_role('heading', name='Projection preview', exact=True)).to_be_visible()
    page.locator('[data-action="home"]').click()
    expect(page.get_by_text('Driver’s iPhone', exact=True)).to_be_visible()
    page.locator('[data-action="settings"]').click()
    page.get_by_role('button', name='Dusk', exact=True).click()
    page.reload()
    expect(page.locator('body')).to_have_attribute('data-wallpaper', 'dusk')
    expect(page.get_by_role('heading', name='Settings', exact=True)).to_be_visible()
    page.locator('[data-action="diagnostics"]').click()
    expect(page.get_by_role('heading', name='Hardware not connected', exact=True)).to_be_visible()
    page.get_by_role('button', name='Back', exact=True).click()
    expect(page.get_by_role('heading', name='Settings', exact=True)).to_be_visible()
    page.locator('[data-action="home"]').click()
    Path('evidence').mkdir(exist_ok=True)
    for width, height in [(1280,720), (800,480), (480,800)]:
        page.set_viewport_size({'width':width, 'height':height})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=f'evidence/home-{width}x{height}.png')
    page.close()

    context = browser.new_context(viewport={'width':1280, 'height':720})
    context.add_init_script("""
      let listener;
      const state = {connected:true, route:'home', front:'livi', projectionReady:false,
        phones:[{id:'a',name:'Driver',status:'active'},{id:'b',name:'Passenger',status:'available'}]};
      const requests = [], calls = [];
      const emit = patch => {Object.assign(state,patch); listener?.(structuredClone(state));};
      window.testHost = {emit, calls, requests, rejectMedia:false};
      window.headunit = {
        getView:async()=>structuredClone(state),
        media:async(control,phoneId)=>{calls.push(['media',control,phoneId]);if(testHost.rejectMedia)throw new Error('Headunit operation unavailable');return {accepted:true};},
        onView:fn=>{listener=fn;return()=>{listener=null;};},
        navigate:async route=>{calls.push(route);emit({route,front:route==='projection'?'projection':'livi'});return {accepted:true};},
        selectPhone:id=>new Promise((resolve,reject)=>requests.push({id,resolve,reject}))
      };
    """)
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8095')
    for target in ['home','phones','projection','camera','cluster','disconnected'] * 2:
        page.evaluate("testHost.emit({connected:true,route:'settings',front:'livi'})")
        page.locator('[data-action="diagnostics"]').click()
        expect(page.get_by_role('heading', name='Diagnostics', exact=True)).to_be_visible()
        if target in ['home','phones','projection']:
            page.locator(f'aside [data-action="{target}"]').click()
        else:
            page.evaluate('(route)=>testHost.emit({route,front:route,connected:route!=="disconnected"})', target)
        expect(page.get_by_role('heading', name='Diagnostics', exact=True)).to_have_count(0)
        page.evaluate("testHost.emit({connected:true,route:'settings',front:'livi'})")
        expect(page.get_by_role('heading', name='Settings', exact=True)).to_be_visible()

    def reset_selection():
        page.evaluate("""testHost.emit({connected:true,route:'phones',front:'livi',projectionReady:false,
          phones:[{id:'a',name:'Driver',status:'active'},{id:'b',name:'Passenger',status:'available'}]});testHost.calls.length=0;""")
        page.get_by_role('button', name='Connect Passenger', exact=True).click()
        expect(page.get_by_text('Switching phone…', exact=True)).to_be_visible()

    def activate():
        page.evaluate("testHost.emit({phones:[{id:'b',name:'Passenger',status:'active'}]})")

    reset_selection()
    page.evaluate("testHost.requests.at(-1).resolve({accepted:true})")
    activate()
    expect(page.get_by_text('Switching phone…', exact=True)).to_be_visible()
    assert page.evaluate('testHost.calls.length') == 0
    page.evaluate('testHost.emit({projectionReady:true})')
    expect(page.locator('.native-projection-region')).to_be_visible()
    assert page.evaluate('testHost.calls') == ['projection']

    for interruption in ['home','camera','cluster','disconnected','failure']:
        reset_selection()
        if interruption == 'home':
            page.locator('aside [data-action="home"]').click()
        elif interruption != 'failure':
            page.evaluate('(route)=>testHost.emit({route,front:route,connected:route!=="disconnected"})', interruption)
        page.evaluate("testHost.requests.at(-1).reject(new Error('Headunit operation unavailable'))")
        if interruption == 'failure':
            expect(page.get_by_role('alert')).to_have_text('Native command unavailable')
        else:
            expect(page.get_by_role('alert')).to_have_count(0)
        page.evaluate("testHost.emit({connected:true,route:'phones',front:'livi',projectionReady:true,phones:[{id:'b',name:'Passenger',status:'active'}]})")
        expect(page.get_by_text('Switching phone…', exact=True)).to_have_count(0)
        assert 'projection' not in page.evaluate('testHost.calls')
    page.evaluate("""testHost.emit({connected:true,route:'home',front:'livi',phones:[{id:'a',name:'Driver',status:'active'}],
      homeStatus:{phone:{status:'available',phoneId:'a',batteryPercent:73,charging:true,freshForMs:30000},
      media:{status:'available',phoneId:'a',title:'Verified track',artist:'Artist',playing:true,freshForMs:30000}}});testHost.calls.length=0;""")
    expect(page.get_by_role('heading', name='Verified track', exact=True)).to_be_visible()
    expect(page.get_by_text('73% · Charging', exact=True)).to_be_visible()
    page.locator('[data-media="pause"]').click()
    assert page.evaluate('testHost.calls') == [['media','pause','a']]
    expect(page.get_by_text('Playing', exact=True)).to_be_visible()
    page.evaluate("testHost.rejectMedia=true")
    page.locator('[data-media="play"]').click()
    expect(page.get_by_role('alert')).to_have_text('Native command unavailable')
    page.evaluate("testHost.emit({homeStatus:{media:{status:'stale',phoneId:'a'}}})")
    expect(page.get_by_text('Media status is stale. Waiting for a core update.', exact=True)).to_be_visible()
    expect(page.locator('[data-media="play"]')).to_be_disabled()
    assert not errors, errors
    browser.close()
    print('PASS: preview persistence, navigation, responsive screenshots; native-bridge fixture repeated diagnostics navigation, readiness ordering and interrupted switching; no page errors. No native runtime or hardware tested.')
