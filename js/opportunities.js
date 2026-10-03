(() => {
  const featuredRoot = document.querySelector('[data-featured-jobs]');
  const listRoot = document.querySelector('[data-all-jobs]');
  if (!featuredRoot && !listRoot) return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeUrl = value => {
    try { const url = new URL(value, window.location.href); return ['http:','https:'].includes(url.protocol) ? url.href : '#'; }
    catch { return '#'; }
  };
  const formatDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en', { day:'numeric', month:'short', year:'numeric' }).format(date);
  };
  const card = job => `<article class="job-card"><div class="job-card-top"><div><h3>${escapeHtml(job.title)}</h3><p class="job-company">${escapeHtml(job.company)}</p></div><span class="job-tag">${escapeHtml(job.category)}</span></div><div class="job-details"><span>${escapeHtml(job.location)}</span><span>·</span><span>${escapeHtml(job.work_type)}</span><span>·</span><span>${escapeHtml(job.experience_level)}</span><span>·</span><span>${escapeHtml(job.employment_type)}</span></div><div class="job-card-foot"><span class="posted">${escapeHtml(formatDate(job.posted_date))} · ${escapeHtml(job.source)}</span><a class="text-link" href="${escapeHtml(safeUrl(job.url))}" target="_blank" rel="noopener noreferrer">View Job <span aria-hidden="true">↗</span></a></div></article>`;
  const allRoot = listRoot;
  const count = document.querySelector('[data-result-count]');
  const pageSize = 6;
  let jobs = [];
  let shown = pageSize;
  let failed = false;

  const readFilters = () => {
    const filters = {};
    document.querySelectorAll('[data-filter]').forEach(input => { filters[input.dataset.filter] = input.value.trim().toLowerCase(); });
    return filters;
  };
  const getMatches = () => {
    const filters = readFilters();
    const keyword = (document.querySelector('#job-search')?.value || '').trim().toLowerCase();
    const cutoffDays = Number(document.querySelector('#filter-date')?.value || 0);
    const cutoff = cutoffDays ? new Date() : null;
    if (cutoff) cutoff.setDate(cutoff.getDate() - cutoffDays);
    return jobs.filter(job => {
      const searchable = [job.title,job.company,job.category,job.location,job.country,job.description].join(' ').toLowerCase();
      if (keyword && !searchable.includes(keyword)) return false;
      if (Object.entries(filters).some(([key,value]) => value && !String(job[key] ?? '').toLowerCase().includes(value))) return false;
      if (cutoff) { const posted = new Date(job.posted_date); if (Number.isNaN(posted.getTime()) || posted < cutoff) return false; }
      return true;
    }).sort((a,b) => {
      const direction = document.querySelector('#job-sort')?.value === 'oldest' ? 1 : -1;
      return direction * String(a.posted_date).localeCompare(String(b.posted_date));
    });
  };
  const renderFeatured = () => {
    if (!featuredRoot) return;
    if (failed) { featuredRoot.innerHTML = '<p class="loading-message">Opportunities could not be loaded. Please try again later.</p>'; return; }
    featuredRoot.innerHTML = jobs.slice().sort((a,b) => b.posted_date.localeCompare(a.posted_date)).slice(0,6).map(card).join('');
  };
  const renderList = () => {
    if (!allRoot) return;
    if (failed) { allRoot.innerHTML = '<div class="empty-state"><h3>Opportunities are unavailable right now.</h3><p>Please refresh the page to try again.</p></div>'; if (count) count.textContent = 'Could not load opportunities'; return; }
    const matches = getMatches();
    if (count) count.textContent = `${matches.length} ${matches.length === 1 ? 'opportunity' : 'opportunities'} found`;
    allRoot.innerHTML = matches.length ? matches.slice(0,shown).map(card).join('') : '<div class="empty-state"><h3>No opportunities match your current filters.</h3><p>Try changing your search or clearing the filters to see more roles.</p><button class="button" type="button" data-empty-clear>Clear Filters</button></div>';
    const more = document.querySelector('[data-load-more]');
    if (more) more.hidden = shown >= matches.length;
  };
  const refresh = () => { shown = pageSize; renderList(); };

  document.querySelectorAll('[data-filter],#job-search,#filter-date,#job-sort').forEach(input => input.addEventListener('input', refresh));
  document.querySelector('[data-search]')?.addEventListener('click', refresh);
  document.querySelector('[data-clear-filters]')?.addEventListener('click', () => {
    document.querySelectorAll('[data-filter],#job-search,#filter-date').forEach(input => { input.value = ''; });
    refresh();
  });
  document.querySelector('[data-load-more]')?.addEventListener('click', () => { shown += pageSize; renderList(); });
  allRoot?.addEventListener('click', event => {
    if (event.target.closest('[data-empty-clear]')) document.querySelector('[data-clear-filters]')?.click();
  });

  fetch('data/jobs.json').then(response => {
    if (!response.ok) throw new Error(`GET data/jobs.json failed: HTTP ${response.status} ${response.statusText}`);
    return response.json();
  })
    .then(data => {
      const feedJobs = Array.isArray(data) ? data : data?.jobs;
      if (!Array.isArray(feedJobs)) throw new TypeError('data/jobs.json must contain a jobs array');
      jobs = feedJobs.map(job => ({
        ...job,
        work_type: job.work_type ?? job.work_mode ?? '',
        experience_level: job.experience_level ?? job.experience ?? '',
        category: job.category || job.department || job.industry || '',
        url: job.url ?? job.job_url ?? '',
      }));
      renderFeatured();
      renderList();
    })
    .catch(error => {
      console.error('Unable to load or render opportunities from data/jobs.json:', error);
      failed = true;
      renderFeatured();
      renderList();
    });
})();
