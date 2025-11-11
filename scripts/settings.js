window.ASIMO_SETTINGS = {
  get useServerVAD()     { return (localStorage.getItem("useServerVAD") || "false") === "true"; },
  set useServerVAD(v)    { localStorage.setItem("useServerVAD", String(!!v)); },
  get recitationMode()   { return (localStorage.getItem("recitationMode") || "false") === "true"; },
  set recitationMode(v)  { localStorage.setItem("recitationMode", String(!!v)); },
  get autoDownload()     { return (localStorage.getItem("autoDownload") || "false") === "true"; }, // default OFF
  set autoDownload(v)    { localStorage.setItem("autoDownload", String(!!v)); },
  get useProtocolV3()    { return (localStorage.getItem("useProtocolV3") || "false") === "true"; }, // default OFF
  set useProtocolV3(v)   { localStorage.setItem("useProtocolV3", String(!!v)); },
};
