"""Production glass/contrast/feature audit. Run against npm start with Python Playwright.
The disconnected host fixture never launches native LIVI or changes system settings.
"""
import json, math, re, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
OUT=Path(os.environ.get('COMFORT_EVIDENCE','/tmp/comfort-evidence')); OUT.mkdir(parents=True,exist_ok=True)
def rgb(value):
    nums=[float(n) for n in re.findall(r'[\d.]+',value)]
    return nums[:3],nums[3] if len(nums)>3 else 1

def luminance(color):
    v=[x/255 for x in color];v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v]
    return sum(a*b for a,b in zip(v,[.2126,.7152,.0722]))
def contrast(a,b):
    x,y=sorted([luminance(a),luminance(b)]);return (y+.05)/(x+.05)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('HEADUNIT_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
    page=browser.new_page(viewport={'width':1280,'height':720})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script("""window.headunit={getView:async()=>({connected:false,route:'home'}),onView:fn=>{window.emitHost=fn;return ()=>{};},navigate:async()=>({accepted:true})};""")
    page.goto(os.environ.get('HEADUNIT_TEST_BASE_URL','http://127.0.0.1:8095')+'/production.html')
    def nav(route): page.locator(f'aside [data-action={route}]').click()
    def strength(value):
        nav('settings');page.locator('[data-glass-strength]').evaluate('(el,value)=>{el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));}',value)
    def styles(selector):
        return page.evaluate('(selector)=>{const s=getComputedStyle(document.querySelector(selector));return {background:s.backgroundColor,image:s.backgroundImage,blur:s.backdropFilter,color:s.color,opacity:s.opacity};}',selector)
    def appearance(value):
        nav('settings');page.locator(f'button[data-appearance={value}]').click()
    surfaces={'home':['.home-time','.home-weather','.home-media','aside'],'settings':['.settings-card','.settings-advanced','aside'],'apps':['main .tile','aside'],'audio':['.local-player','.local-library','aside'],'bluetooth':['.feature-stage','aside'],'projection':['.feature-stage','aside']}
    results=[]
    for mode in ['night','day']:
        appearance(mode); readings={}
        for value in [0,100]:
            strength(value)
            for route,selectors in surfaces.items():
                nav(route)
                for selector in selectors:readings[(value,route,selector)]=styles(selector)
        for route,selectors in surfaces.items():
            for selector in selectors:
                low,high=readings[(0,route,selector)],readings[(100,route,selector)]
                assert low['blur']!=high['blur'],(mode,route,selector,'glass slider ignored',low,high)
                assert low['background']!=high['background'],(mode,route,selector,'tint unchanged')
                assert float(low['opacity'])==1,'Foreground opacity must not change'
                for style in [low,high]:
                    background,alpha=rgb(style['background']);foreground,_=rgb(style['color'])
                    assert 0<alpha<1,(route,'opaque glass',style)
                    ratios=[contrast(foreground,[alpha*c+(1-alpha)*wall for c in background]) for wall in [0,255]]
                    assert min(ratios)>=4.5,(mode,route,selector,'contrast',ratios,style)
                if mode=='day':assert max(rgb(high['background'])[0])<=220,('harsh day surface',high)
        nav('audio')
        selected=styles('[data-local-tab=library]')
        assert contrast(rgb(selected['color'])[0],rgb(selected['background'])[0])>=4.5,('selected audio tab contrast',selected)
        nav('settings')
        assert styles('.swatch.coast')['image']!='none','Selected wallpaper must retain its preview'
        strength(55)
        for width,height in [(1920,1080),(1280,720),(800,480),(480,800)]:
            page.set_viewport_size({'width':width,'height':height})
            for route in surfaces:
                nav(route)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(mode,width,height,route,'horizontal overflow')
                page.screenshot(path=str(OUT/f'{mode}-{route}-{width}x{height}.png'),full_page=True)
        results.append({'mode':mode,'surface_checks':sum(len(v) for v in surfaces.values()),'sizes':4})
    # Exercise saved scale/dock settings at compact landscape and portrait widths.
    for width,height in [(800,480),(480,800)]:
        page.set_viewport_size({'width':width,'height':height})
        for scale in [90,100,115]:
            nav('settings');page.locator('[data-ui-scale]').evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}',scale)
            for side in ['left','right']:
                nav('settings');page.locator(f'button[data-dock-side={side}]').click()
                for route in ['home','audio','apps','settings']:
                    nav(route)
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,height,scale,side,route,'overflow')
    nav('settings');page.locator('[data-reset-ui-scale]').click();page.locator('button[data-dock-side=left]').click()
    page.set_viewport_size({'width':800,'height':480})
    for mode in ['night','day']:
        appearance(mode)
        for feature,value in [('prefers-reduced-transparency','reduce'),('prefers-contrast','more'),('forced-colors','active')]:
            session=page.context.new_cdp_session(page)
            session.send('Emulation.setEmulatedMedia',{'features':[{'name':feature,'value':value}]})
            for route,selectors in surfaces.items():
                nav(route)
                for selector in selectors:
                    style=styles(selector);assert style['blur']=='none',(feature,mode,route,selector,style)
                    assert rgb(style['background'])[1]==1,(feature,'surface must be solid',style)
            results.append({'mode':mode,'preference':feature,'passed':True})
            session.send('Emulation.setEmulatedMedia',{'features':[]});session.detach()
    assert not errors,errors
    print(json.dumps({'result':'passed','checks':results,'scale_checks':48,'page_errors':errors}))
    browser.close()
