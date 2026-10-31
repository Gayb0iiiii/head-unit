"""Browser integration: production CSP, actual IndexedDB and Chromium WAV decoder.
Run with npm start in another terminal; requires Python Playwright + Chromium.
No native host, external network, sound hardware or DSP is exercised.
"""
import json, tempfile, wave, re, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

with tempfile.TemporaryDirectory() as folder, sync_playwright() as p:
    paths=[]
    for name in ['Coastal drive', 'Night drive']:
        path=Path(folder)/f'{name}.wav'
        with wave.open(str(path),'wb') as wav:
            wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(8000)
            wav.writeframes(b'\0'*8000*4*20)
        paths.append(str(path))
    browser=p.chromium.launch(executable_path=os.environ.get('HEADUNIT_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
    page=browser.new_page(viewport={'width':1280,'height':720})
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.add_init_script("""window.headunit={getView:async()=>({connected:false,route:'home'}),onView:fn=>{window.emitHost=fn;return ()=>{};},navigate:async()=>({accepted:true})};""")
    page.goto(os.environ.get('HEADUNIT_TEST_BASE_URL','http://127.0.0.1:8095')+'/production.html')
    page.locator('.dock-apps [data-action=audio]').click()
    expect(page.get_by_role('heading',name='Bring your collection')).to_be_visible()
    page.locator('[data-local-files]').first.set_input_files(paths)
    expect(page.locator('.local-count')).to_contain_text('2 tracks')
    page.get_by_role('button',name='Play Coastal drive',exact=True).click()
    expect(page.get_by_role('button',name='Pause local audio')).to_be_visible()
    expect(page.locator('#local-duration')).to_have_text('0:20')
    expect(page.locator("#local-elapsed")).not_to_have_text("0:00")
    page.get_by_role('button',name='Pause local audio').click()
    page.get_by_role('button',name='Add Night drive to queue').click()
    page.get_by_role('button',name='Favourite Coastal drive',exact=True).focus()
    page.keyboard.press('Enter')
    assert page.evaluate('document.activeElement?.getAttribute("aria-label")')=='Favourite Coastal drive'
    page.get_by_role('button',name='Next track',exact=True).click()
    expect(page.locator('.local-now h2')).to_have_text('Night drive')
    page.get_by_role('button',name='Pause local audio').click()
    page.get_by_role('button',name='Queue (2)',exact=True).click()
    page.get_by_role('button',name='Move Night drive earlier').click()
    expect(page.locator('.local-track-title').first).to_contain_text('Night drive')
    for width,height in [(1280,720),(800,480),(480,800)]:
        page.set_viewport_size({'width':width,'height':height})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width,height,'horizontal overflow')
        page.screenshot(path=f'/tmp/local-audio-{width}x{height}.png',full_page=True)
    page.get_by_role('button',name='Library',exact=True).click()
    page.locator('.local-tools summary').click()
    page.locator('[data-local-group]').select_option('folder')
    expect(page.locator('.local-tools')).not_to_have_attribute('open','')
    page.get_by_role('button',name='Imported files 2 tracks').click()
    expect(page.locator('.local-track')).to_have_count(2)
    page.locator('.local-tools summary').click()
    page.locator('[data-local-search]').fill('coastal')
    expect(page.locator('.local-track')).to_have_count(1)
    page.locator('[data-local-search]').fill('')
    page.keyboard.press('Escape');expect(page.locator('.local-tools')).not_to_have_attribute('open','')
    expect(page.locator('main')).to_have_attribute('data-screen','audio')
    page.reload();page.locator('.dock-apps [data-action=audio]').click()
    expect(page.locator('.local-count')).to_contain_text('2 tracks')
    expect(page.get_by_role('button',name='Play local audio',exact=True)).to_be_visible()
    expect(page.locator('.local-now h2')).to_have_text('Night drive')
    page.get_by_role('button',name='Favourites',exact=True).click()
    expect(page.locator('.local-track')).to_have_count(1)
    page.get_by_role('button',name='Play Coastal drive',exact=True).click()
    expect(page.get_by_role('button',name='Pause local audio')).to_be_visible()
    page.locator('.dock-apps [data-action=projection]').click()
    page.locator('.dock-apps [data-action=audio]').click()
    expect(page.get_by_role('button',name='Play local audio',exact=True)).to_be_visible()
    page.get_by_role('button',name='Library',exact=True).click()
    if not page.locator('.local-tools').evaluate('el=>el.open'):page.locator('.local-tools summary').click()
    page.get_by_role('button',name='Manage',exact=True).click()
    page.get_by_role('button',name='Delete imported copy of Night drive').click()
    expect(page.locator('.local-count')).to_contain_text('2 tracks')
    page.get_by_role('button',name='Delete copy',exact=True).click()
    expect(page.locator('.local-count')).to_contain_text('1 track')
    page.reload();page.locator('.dock-apps [data-action=audio]').click()
    expect(page.locator('.local-count')).to_contain_text('1 track')
    assert not errors, errors
    print(json.dumps({'result':'passed','checks':['import','WAV decode + time progress','pause','next','favourites','queue reorder','reload persistence without autoplay','projection handoff pause','folder browsing + search','persistent removal','no horizontal overflow at 1280x720, 800x480, 480x800'],'page_errors':errors}))
    browser.close()
