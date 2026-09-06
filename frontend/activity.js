(() => {
  const api = `${window.wordApi?.apiUrl || ''}/api/activity`;
  let state = null;
  let enabled = false;
  let consentVersion = 0;
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Activity privacy preferences');
  panel.innerHTML = '<p>Allow anonymous activity analytics? With your permission, we record page visits, submission counts, approximate country and device categories for 30 days, and notify site operators through Telegram. Form contents are excluded.</p><button type="button" data-allow>Allow analytics</button> <button type="button" data-decline>Decline</button><p role="status"></p>';
  document.querySelector('main').append(panel);
  const status = panel.querySelector('[role=status]');
  async function request(path, body) {
    const response = await fetch(api + path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!response.ok) throw new Error('Analytics request failed');
    return response.json();
  }
  panel.querySelector('[data-allow]').onclick = async () => {
    const version = ++consentVersion;
    panel.querySelector('[data-allow]').disabled=true;
    try {
      const referral = new URLSearchParams(location.search).get('ref');
      const result = await request('/state', {consent:'granted',referral});
      if(version !== consentVersion) { await request('/withdraw',{state:result.state}); return; }
      state=result.state; enabled=true;
      await request('/visit',{consent:'granted',state,page:location.pathname});
      if(version !== consentVersion) return;
      status.textContent='Analytics enabled for this page. You can withdraw and delete this session’s activity below.';
      panel.querySelector('[data-allow]').disabled=true;
      panel.querySelector('[data-decline]').textContent='Withdraw and delete activity';
    } catch { if(version === consentVersion) { enabled=false; panel.querySelector('[data-allow]').disabled=false; status.textContent='Analytics is unavailable. You can continue using the page.'; } }
  };
  panel.querySelector('[data-decline]').onclick = async () => {
    enabled=false;
    consentVersion++;
    try { if(state) await request('/withdraw',{state}); state=null; status.textContent='Analytics disabled. Session activity deleted.'; panel.querySelector('[data-allow]').disabled=false; }
    catch { status.textContent='Analytics disabled. Deletion failed; press again to retry.'; }
  };
  window.activityMetadata = () => enabled ? {consent:'granted',state,page:location.pathname} : undefined;
})();
