// Settings panel toggle and initialization
document.addEventListener('DOMContentLoaded', function(){
  const gear = document.getElementById('settingsGear');
  const panel = document.getElementById('settingsPanel');

  console.log('[Settings] Initializing...', {
    gear: !!gear,
    panel: !!panel,
    ASIMO_SETTINGS: !!window.ASIMO_SETTINGS
  });

  if(!gear || !panel) {
    console.error('[Settings] Missing elements!', {gear: !!gear, panel: !!panel});
    return;
  }

  // Toggle panel on gear click
  gear.addEventListener('click', function(){
    console.log('[Settings] Gear clicked!');
    const isHidden = panel.style.display === 'none' ||
                     !panel.style.display ||
                     window.getComputedStyle(panel).display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    console.log('[Settings] Panel toggled:', panel.style.display);
  });

  // Bind checkbox to setting
  const chk = (id, get, set) => {
    const el = document.getElementById(id);
    if(!el) {
      console.warn('[Settings] Checkbox not found:', id);
      return;
    }
    try {
      el.checked = get();
      el.addEventListener('change', () => {
        set(el.checked);
        console.log('[Settings] Changed:', id, el.checked);
      });
    } catch(e) {
      console.error('[Settings] Error binding:', id, e);
    }
  };

  // Bind all settings checkboxes
  if(window.ASIMO_SETTINGS) {
    chk('useServerVAD', () => ASIMO_SETTINGS.useServerVAD, v => ASIMO_SETTINGS.useServerVAD = v);
    chk('recitationMode', () => ASIMO_SETTINGS.recitationMode, v => ASIMO_SETTINGS.recitationMode = v);
    chk('autoDownload', () => ASIMO_SETTINGS.autoDownload, v => ASIMO_SETTINGS.autoDownload = v);
    chk('useProtocolV3', () => ASIMO_SETTINGS.useProtocolV3, v => ASIMO_SETTINGS.useProtocolV3 = v);
  } else {
    console.error('[Settings] ASIMO_SETTINGS not defined!');
  }

  console.log('[Settings] Initialization complete');
});
