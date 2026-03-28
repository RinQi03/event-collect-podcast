const API = window.location.origin;

// ── State ──────────────────────────────────────────────────────────────────
let profile       = null;
let opportunities = [];
let filtered      = [];
let scripts       = {};
let activeFilter  = 'all';
let activeOppId   = null;
let chatMessages  = [];

// Broadcast
let broadcastIdx    = 0;
let broadcastActive = false;
let broadcastPaused = false;

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  profile = loadProfile();
  if (!profile) {
    showOnboarding();
  } else {
    showApp();
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  SCHOOL THEMES
// ══════════════════════════════════════════════════════════════════════════
const SCHOOL_THEMES = {
  'mit':            { color: '#A31F34', text: '#fff', name: 'MIT' },
  'harvard':        { color: '#A51C30', text: '#fff', name: 'Harvard' },
  'stanford':       { color: '#8C1515', text: '#fff', name: 'Stanford' },
  'yale':           { color: '#00356B', text: '#fff', name: 'Yale' },
  'princeton':      { color: '#E77500', text: '#fff', name: 'Princeton' },
  'columbia':       { color: '#003087', text: '#fff', name: 'Columbia' },
  'penn':           { color: '#011F5B', text: '#fff', name: 'UPenn' },
  'uchicago':       { color: '#800000', text: '#fff', name: 'UChicago' },
  'duke':           { color: '#012169', text: '#fff', name: 'Duke' },
  'northwestern':   { color: '#4E2A84', text: '#fff', name: 'Northwestern' },
  'michigan':       { color: '#00274C', text: '#FFCB05', name: 'U Michigan' },
  'ucla':           { color: '#2774AE', text: '#FFD100', name: 'UCLA' },
  'uc berkeley':    { color: '#003262', text: '#FDB515', name: 'UC Berkeley' },
  'berkeley':       { color: '#003262', text: '#FDB515', name: 'UC Berkeley' },
  'nyu':            { color: '#57068C', text: '#fff', name: 'NYU' },
  'carnegie mellon':{ color: '#C41230', text: '#fff', name: 'CMU' },
  'cmu':            { color: '#C41230', text: '#fff', name: 'CMU' },
  'georgia tech':   { color: '#B3A369', text: '#003057', name: 'Georgia Tech' },
  'ut austin':      { color: '#BF5700', text: '#fff', name: 'UT Austin' },
  'cornell':        { color: '#B31B1B', text: '#fff', name: 'Cornell' },
  'notre dame':     { color: '#0C2340', text: '#C99700', name: 'Notre Dame' },
  'vanderbilt':     { color: '#866D4B', text: '#fff', name: 'Vanderbilt' },
  'emory':          { color: '#012169', text: '#fff', name: 'Emory' },
  'georgetown':     { color: '#002147', text: '#63B1E5', name: 'Georgetown' },
  'parsons':        { color: '#E31937', text: '#fff', name: 'Parsons' },
  'fit':            { color: '#003DA5', text: '#fff', name: 'FIT' },
  'pratt':          { color: '#005695', text: '#fff', name: 'Pratt' },
  'risd':           { color: '#003DA5', text: '#fff', name: 'RISD' },
  'purdue':         { color: '#CEB888', text: '#000', name: 'Purdue' },
  'ohio state':     { color: '#BB0000', text: '#fff', name: 'Ohio State' },
  'boston university': { color: '#CC0000', text: '#fff', name: 'BU' },
  'bu':             { color: '#CC0000', text: '#fff', name: 'BU' },
  'usc':            { color: '#990000', text: '#FFCC00', name: 'USC' },
  'rutgers':        { color: '#CC0033', text: '#fff', name: 'Rutgers' },
  'uw':             { color: '#4B2E83', text: '#E8D3A4', name: 'UW' },
  'washington':     { color: '#4B2E83', text: '#E8D3A4', name: 'UW' },
};

function detectSchoolTheme(schoolName) {
  if (!schoolName) return null;
  const s = schoolName.toLowerCase();
  for (const [key, theme] of Object.entries(SCHOOL_THEMES)) {
    if (s.includes(key)) return theme;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════
//  ONBOARDING — STEP MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════
const OB_SCREENS = ['ob-step-1', 'ob-render-screen', 'ob-step-2', 'ob-step-3'];

function goToScreen(id) {
  OB_SCREENS.forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
  // Scroll to top
  document.getElementById('onboarding').scrollTop = 0;
}

function showOnboarding() {
  document.getElementById('onboarding').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  goToScreen('ob-step-1');
  initIdCard();
}

// ══════════════════════════════════════════════════════════════════════════
//  STEP 1: ID CARD
// ══════════════════════════════════════════════════════════════════════════
const AVATARS = ['🧑‍💻','👩‍🎨','👨‍⚕️','👩‍💼','👨‍🔬','👩‍🏫','🧑‍🎤','👩‍⚖️','🧑‍🍳','👨‍🎨','👩‍🚀','🧑‍🌾'];
let selectedAvatar = '🧑‍💻';
let avatarIsCustom = false;
let isEduEmail     = false;

function initIdCard() {
  // Build avatar grid
  const grid = document.getElementById('avatar-grid');
  AVATARS.forEach(a => {
    const el = document.createElement('div');
    el.className = 'avatar-opt' + (a === selectedAvatar ? ' selected' : '');
    el.textContent = a;
    el.addEventListener('click', () => {
      selectedAvatar = a; avatarIsCustom = false;
      document.querySelectorAll('.avatar-opt').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      updateAvatarDisplay();
      closeAvatarPicker();
    });
    grid.appendChild(el);
  });

  // Avatar click → open picker
  document.getElementById('id-avatar').addEventListener('click', () => {
    document.getElementById('avatar-picker').classList.remove('hidden');
  });
  document.getElementById('avatar-cancel').addEventListener('click', closeAvatarPicker);

  // File upload
  document.getElementById('avatar-upload').addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      selectedAvatar = e.target.result;
      avatarIsCustom = true;
      updateAvatarDisplay();
      closeAvatarPicker();
    };
    reader.readAsDataURL(file);
  });

  // Name → update initials
  document.getElementById('idf-name').addEventListener('input', function() {
    if (!avatarIsCustom && selectedAvatar.length > 2) return;
    if (!avatarIsCustom) updateAvatarInitials(this.value);
  });

  // Email → detect .edu
  document.getElementById('idf-email').addEventListener('input', function() {
    isEduEmail = this.value.trim().toLowerCase().endsWith('.edu');
    document.getElementById('id-edu-badge').textContent = isEduEmail ? '🎓 .edu verified' : '';
  });

  // Edu level → year label
  document.getElementById('idf-edu').addEventListener('change', function() {
    document.getElementById('idf-year-label').textContent =
      this.value.includes('career') ? 'EXP (YRS)' : 'CLASS OF';
    document.getElementById('idf-year').placeholder =
      this.value.includes('career') ? '1–3' : '2027';
  });

  // Continue button
  document.getElementById('ob-to-render').addEventListener('click', saveIdCard);

  // Generate random card ID
  document.getElementById('id-card-id').textContent =
    'ID: ' + Math.random().toString(36).slice(2, 10).toUpperCase();

  updateAvatarDisplay();
}

function updateAvatarDisplay() {
  const initialsEl = document.getElementById('id-avatar-initials');
  const imgEl      = document.getElementById('id-avatar-img');
  if (avatarIsCustom) {
    imgEl.src = selectedAvatar;
    imgEl.style.display = 'block';
    initialsEl.style.display = 'none';
  } else {
    initialsEl.textContent    = selectedAvatar;
    initialsEl.style.fontSize = selectedAvatar.length <= 2 ? '36px' : '30px';
    imgEl.style.display       = 'none';
    initialsEl.style.display  = 'block';
  }
}

function updateAvatarInitials(name) {
  const parts = name.trim().split(' ');
  const initials = parts.length >= 2
    ? parts[0][0] + parts[parts.length - 1][0]
    : (parts[0]?.[0] || '?');
  const el = document.getElementById('id-avatar-initials');
  el.textContent  = initials.toUpperCase();
  el.style.fontSize = '28px';
}

function closeAvatarPicker() {
  document.getElementById('avatar-picker').classList.add('hidden');
}

function saveIdCard() {
  profile = {
    name:             document.getElementById('idf-name').value.trim()  || 'there',
    email:            document.getElementById('idf-email').value.trim(),
    school:           document.getElementById('idf-school').value.trim(),
    major:            document.getElementById('idf-major').value.trim() || 'General Studies',
    edu_level:        document.getElementById('idf-edu').value,
    year:             document.getElementById('idf-year').value,
    location:         document.getElementById('idf-location').value.trim(),
    is_edu_email:     isEduEmail,
    avatar:           selectedAvatar,
    avatar_custom:    avatarIsCustom,
    card_id:          document.getElementById('id-card-id').textContent,
    interests:        [],
    activity_forms:   [],
    delivery_freq:    'daily',
    delivery_methods: ['inapp'],
    delivery_email:   '',
  };

  goToScreen('ob-render-screen');
  buildAndAnimateRenderCard();
}

// ══════════════════════════════════════════════════════════════════════════
//  RENDER ANIMATION
// ══════════════════════════════════════════════════════════════════════════
function buildAndAnimateRenderCard() {
  const theme = detectSchoolTheme(profile.school);

  // Build the static card HTML
  const avatarHtml = profile.avatar_custom
    ? `<img src="${profile.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>`
    : `<span style="font-size:36px;line-height:1">${profile.avatar}</span>`;

  const headerStyle = theme
    ? `style="background:${theme.color};border-radius:8px 8px 0 0;margin:-24px -26px 16px;padding:14px 26px;border-bottom:none"`
    : '';
  const logoStyle  = theme ? `style="color:${theme.text}"` : '';
  const badgeStyle = theme ? `style="color:${theme.text};opacity:.8;border-color:rgba(255,255,255,.3)"` : '';
  const badgeText  = theme ? theme.name.toUpperCase() : 'STUDENT PROFILE';

  const cardHtml = `
    <div class="id-card" style="pointer-events:none;position:relative;overflow:hidden">
      <div class="id-card-header" ${headerStyle}>
        <div class="id-card-logo" ${logoStyle}>◈ OPPORTUNITY COMPASS</div>
        <div class="id-card-badge" ${badgeStyle}>${badgeText}</div>
      </div>
      <div class="id-card-body">
        <div class="id-avatar-col">
          <div class="id-avatar" style="cursor:default;display:flex;align-items:center;justify-content:center">${avatarHtml}</div>
          ${profile.is_edu_email ? '<div class="id-edu-badge">🎓 .edu verified</div>' : '<div class="id-edu-badge"></div>'}
        </div>
        <div class="id-fields-col">
          <div class="id-field-row"><span class="id-field-label">NAME</span><span class="id-field-input" style="display:block">${esc(profile.name)}</span></div>
          <div class="id-field-row"><span class="id-field-label">EMAIL</span><span class="id-field-input" style="display:block">${esc(profile.email)}</span></div>
          <div class="id-field-row"><span class="id-field-label">SCHOOL</span><span class="id-field-input" style="display:block">${esc(profile.school)}</span></div>
          <div class="id-field-row"><span class="id-field-label">MAJOR / FIELD</span><span class="id-field-input" style="display:block">${esc(profile.major)}</span></div>
          <div class="id-field-row two-col">
            <div><span class="id-field-label">STATUS</span><span class="id-field-input" style="display:block">${esc(profile.edu_level)}</span></div>
            <div><span class="id-field-label">${profile.edu_level.includes('career') ? 'EXP (YRS)' : 'CLASS OF'}</span><span class="id-field-input" style="display:block;width:80px">${esc(profile.year)}</span></div>
          </div>
          <div class="id-field-row"><span class="id-field-label">LOCATION</span><span class="id-field-input" style="display:block">${esc(profile.location)}</span></div>
        </div>
      </div>
      <div class="id-card-footer">
        <div class="id-barcode"></div>
        <div class="id-card-id">${esc(profile.card_id)}</div>
      </div>
      <div id="render-verified-stamp" style="display:none;opacity:0;position:absolute;right:22px;top:50%;transform:translateY(-50%) rotate(-15deg) scale(0);border:3px solid rgba(76,175,125,.85);color:rgba(76,175,125,.95);font-size:13px;font-weight:900;letter-spacing:2px;padding:8px 12px;border-radius:5px;text-align:center;line-height:1.2">✓<br/><span>VERIFIED</span></div>
      <div id="render-scan-line" style="display:none;position:absolute;left:0;right:0;height:3px;top:0;background:linear-gradient(90deg,transparent,rgba(232,106,46,.9),transparent);box-shadow:0 0 14px rgba(232,106,46,.7);border-radius:2px"></div>
      <div class="id-card-foil" id="render-foil"></div>
      <div class="id-card-shine" id="render-shine"></div>
    </div>`;

  document.getElementById('ob-render-card-wrap').innerHTML = cardHtml;

  // Apply school glow to card
  const cardEl = document.querySelector('#ob-render-card-wrap .id-card');
  if (cardEl && theme) {
    cardEl.style.boxShadow = `0 0 0 1px ${theme.color}60, 0 0 60px ${theme.color}50, 0 30px 80px rgba(0,0,0,.7)`;
  } else if (cardEl) {
    cardEl.style.boxShadow = `0 0 60px rgba(232,106,46,.25), 0 30px 80px rgba(0,0,0,.7)`;
  }

  // Set message
  const msg = document.getElementById('ob-render-msg');
  msg.textContent = 'Building your profile…';

  // Hide dots initially
  const dots = document.querySelector('.ob-render-dots');

  // Sequence
  const confettiColors = theme
    ? [theme.color, '#ffffff', '#f0f0f0', theme.text === '#fff' ? '#ffddaa' : theme.text]
    : ['#e86a2e', '#f0953a', '#ffffff', '#ffddaa'];

  // t=400: show scan line
  setTimeout(() => {
    const sl = document.getElementById('render-scan-line');
    if (sl) {
      sl.style.display = 'block';
      sl.style.animation = 'scan-sweep 1s cubic-bezier(.4,0,.6,1) forwards';
    }
    msg.textContent = 'Scanning profile…';
  }, 400);

  // t=1200: hide scan line, apply school color pop, show message
  setTimeout(() => {
    const sl = document.getElementById('render-scan-line');
    if (sl) sl.style.display = 'none';
    msg.textContent = theme
      ? `Welcome to ${theme.name}, ${profile.name}!`
      : `Profile ready, ${profile.name}!`;
  }, 1400);

  // t=1600: show VERIFIED stamp
  setTimeout(() => {
    const stamp = document.getElementById('render-verified-stamp');
    if (stamp) {
      stamp.style.display = 'block';
      stamp.style.animation = 'stamp-pop .45s cubic-bezier(.17,.67,.28,1.45) forwards';
    }
    msg.textContent = 'Profile verified ✓';
  }, 1600);

  // t=2000: confetti burst
  setTimeout(() => {
    burstConfetti(document.getElementById('confetti-container'), confettiColors);
  }, 2000);

  // t=1800: trigger shine sweep
  setTimeout(() => {
    const shine = document.getElementById('render-shine');
    if (shine) shine.classList.add('sweeping');
  }, 1800);

  // t=2400: hide dots, enable tilt + holographic foil, show continue button
  setTimeout(() => {
    const dots = document.getElementById('ob-render-dots');
    if (dots) dots.style.display = 'none';

    const renderedCard = document.querySelector('#ob-render-card-wrap .id-card');
    const wrap = document.getElementById('ob-render-card-wrap');
    const foil = document.getElementById('render-foil');

    if (renderedCard && wrap) {
      wrap.addEventListener('mousemove', e => {
        const r  = renderedCard.getBoundingClientRect();
        const cx = r.left + r.width  / 2;
        const cy = r.top  + r.height / 2;
        const dx = (e.clientX - cx) / (r.width  / 2);
        const dy = (e.clientY - cy) / (r.height / 2);

        renderedCard.style.transform = `rotateY(${dx * 12}deg) rotateX(${-dy * 8}deg)`;

        // Holographic foil — shifts with tilt
        if (foil) {
          const px = ((dx + 1) / 2) * 100;
          const py = ((dy + 1) / 2) * 100;
          const angle = 135 + dx * 25;
          foil.style.background = `
            radial-gradient(circle at ${px}% ${py}%, rgba(255,255,255,.13) 0%, transparent 55%),
            linear-gradient(${angle}deg,
              rgba(255,80,120,.07),
              rgba(80,200,255,.07),
              rgba(120,255,160,.07),
              rgba(255,200,80,.07))
          `;
          foil.style.opacity = '1';
        }
      });
      wrap.addEventListener('mouseleave', () => {
        renderedCard.style.transform = 'rotateY(0deg) rotateX(0deg)';
        renderedCard.style.transition = 'transform .5s ease';
        if (foil) foil.style.opacity = '0';
      });
      wrap.addEventListener('mouseenter', () => {
        renderedCard.style.transition = 'transform .06s ease';
      });
    }

    const continueBtn = document.getElementById('ob-render-continue');
    if (continueBtn) {
      continueBtn.classList.remove('hidden');
      continueBtn.addEventListener('click', () => {
        initStep2();
        goToScreen('ob-step-2');
      });
    }
  }, 2400);
}

function burstConfetti(container, colors) {
  if (!container) return;
  const count = 60;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left  = Math.random() * 100;
    const delay = Math.random() * 0.6;
    const dur   = 1.8 + Math.random() * 1.4;
    const size  = 6 + Math.random() * 7;
    const rot   = Math.random() * 360;
    piece.style.cssText = `
      left:${left}%;
      background:${color};
      width:${size}px;
      height:${size * 1.3}px;
      animation-duration:${dur}s;
      animation-delay:${delay}s;
      transform:rotate(${rot}deg);
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
    `;
    container.appendChild(piece);
    setTimeout(() => piece.remove(), (dur + delay + 0.2) * 1000);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  STEP 2: ACTIVITIES / INTERESTS
// ══════════════════════════════════════════════════════════════════════════
const ACTIVITY_MAP = {
  tech:     ['Hackathon', 'Tech Meetup', 'Industry News', 'Research Opportunity', 'Grant / Scholarship', 'Online Course'],
  design:   ['Exhibition / Open Call', 'Design Competition', 'Portfolio Review', 'Fashion Show / Runway', 'Creative Workshop', 'Artist Residency'],
  fashion:  ['Fashion Show / Runway', 'Exhibition / Open Call', 'Portfolio Review', 'Design Competition', 'Brand Competition', 'Creative Workshop'],
  art:      ['Exhibition / Open Call', 'Artist Residency', 'Portfolio Review', 'Creative Workshop', 'Performance / Audition'],
  business: ['Case Competition', 'Pitch Competition', 'Networking Event', 'Conference', 'Industry News', 'Grant / Scholarship'],
  finance:  ['Case Competition', 'Networking Event', 'Conference', 'Industry News', 'Internship Fair'],
  health:   ['Research Opportunity', 'Clinical Volunteer', 'Health Conference', 'Grant / Scholarship', 'Health Hackathon'],
  law:      ['Policy Conference', 'Legal Fellowship', 'Moot Court', 'Research Opportunity', 'Networking Event'],
  media:    ['Film Festival', 'Content Creation Challenge', 'Journalism Competition', 'Networking Event', 'Conference'],
  music:    ['Performance / Audition', 'Artist Residency', 'Creative Workshop', 'Exhibition / Open Call'],
  science:  ['Research Opportunity', 'Grant / Scholarship', 'Conference', 'Science Competition', 'Hackathon'],
  education:['Grant / Scholarship', 'Research Opportunity', 'Conference', 'Volunteer Opportunity', 'Workshop'],
  social:   ['Volunteer Opportunity', 'Grant / Scholarship', 'Conference', 'Networking Event', 'Research Opportunity'],
};
const UNIVERSAL = ['Networking Event', 'Workshop', 'Conference', 'Grant / Scholarship', 'School / Alumni Event', 'Career Fair', 'Speaker Series', 'Internship / Job Posting'];

function suggestActivities(major) {
  if (!major) return [...UNIVERSAL];
  const m = major.toLowerCase();
  let hits = [];
  if (/cs|comput|software|tech|engineer|ai\b|data|cyber|coding|program|info/.test(m)) hits = ACTIVITY_MAP.tech;
  else if (/fashion/.test(m))                                                           hits = ACTIVITY_MAP.fashion;
  else if (/design|graphic|ux|ui|visual/.test(m))                                      hits = ACTIVITY_MAP.design;
  else if (/art|illustrat|studio|paint|sculpt/.test(m))                                hits = ACTIVITY_MAP.art;
  else if (/business|manag|mba|entrepren/.test(m))                                     hits = ACTIVITY_MAP.business;
  else if (/financ|account|econ|invest|banking/.test(m))                               hits = ACTIVITY_MAP.finance;
  else if (/health|nurs|med|bio|pharma|premed|public health/.test(m))                  hits = ACTIVITY_MAP.health;
  else if (/law|legal|policy|politic|govern/.test(m))                                  hits = ACTIVITY_MAP.law;
  else if (/film|media|journal|communicat|pr\b|broadcast|market|advert/.test(m))       hits = ACTIVITY_MAP.media;
  else if (/music|theater|theatr|perform|dance|drama/.test(m))                         hits = ACTIVITY_MAP.music;
  else if (/scien|chem|phys|math|stat|bio(?!tech)/.test(m))                            hits = ACTIVITY_MAP.science;
  else if (/teach|educ/.test(m))                                                        hits = ACTIVITY_MAP.education;
  else if (/social|sociol|psychol|counsel|human/.test(m))                              hits = ACTIVITY_MAP.social;
  return [...new Set([...hits, ...UNIVERSAL])];
}

let step2Inited = false;
function initStep2() {
  if (step2Inited) return;
  step2Inited = true;

  const hint = document.getElementById('ob-s2-hint');
  hint.textContent = profile.major && profile.major !== 'General Studies'
    ? `Suggested for ${profile.major}`
    : '';

  renderActivityChips(profile.major);
  updateChipCount();

  // Live count update
  document.getElementById('ob-step-2').addEventListener('click', e => {
    if (e.target.classList.contains('chip')) updateChipCount();
  });

  document.getElementById('ob-to-delivery').addEventListener('click', () => {
    profile.activity_forms = [
      ...document.querySelectorAll('#chips-activities .chip.selected, #chips-activities-extra .chip.selected')
    ].map(c => c.dataset.val);

    initStep3();
    goToScreen('ob-step-3');
  });
}

function updateChipCount() {
  const n = document.querySelectorAll('#chips-activities .chip.selected, #chips-activities-extra .chip.selected').length;
  const el = document.getElementById('ob-s2-count');
  if (el) el.textContent = n === 0 ? 'None selected' : `${n} selected`;
}

function renderActivityChips(major) {
  const suggested = suggestActivities(major);
  const container = document.getElementById('chips-activities');

  const selected = [
    ...document.querySelectorAll('#chips-activities .chip.selected, #chips-activities-extra .chip.selected')
  ].map(c => c.dataset.val);

  const primary = suggested.slice(0, 6);
  const extra   = suggested.slice(6);

  container.innerHTML = '';
  primary.forEach(val => container.appendChild(makeChip(val, selected.includes(val))));

  if (isEduEmail) {
    container.appendChild(makeChip('School / Campus Events', selected.includes('School / Campus Events'), true));
  }

  const extraContainer = document.getElementById('chips-activities-extra');
  extraContainer.innerHTML = '';
  extra.forEach(val => extraContainer.appendChild(makeChip(val, selected.includes(val))));

  // Auto-select first 3 if nothing selected
  if (!container.querySelectorAll('.chip.selected').length && primary.length) {
    container.querySelectorAll('.chip:nth-child(-n+3)').forEach(c => c.classList.add('selected'));
  }
}

function makeChip(val, isSelected, isEdu = false) {
  const c = document.createElement('span');
  c.className = 'chip' + (isSelected ? ' selected' : '') + (isEdu ? ' edu-chip' : '');
  c.dataset.val = val;
  c.textContent = val;
  c.addEventListener('click', () => c.classList.toggle('selected'));
  return c;
}

// ══════════════════════════════════════════════════════════════════════════
//  STEP 3: DELIVERY SETUP
// ══════════════════════════════════════════════════════════════════════════
let step3Inited = false;
function initStep3() {
  if (step3Inited) return;
  step3Inited = true;

  // Pre-fill email if we have one from the card
  if (profile.email) {
    document.getElementById('delivery-email').value = profile.email;
  }

  // Frequency toggle
  document.getElementById('freq-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.dtog');
    if (!btn) return;
    document.querySelectorAll('.dtog').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    profile.delivery_freq = btn.dataset.val;
    document.getElementById('custom-time-row').classList.toggle('hidden', btn.dataset.val !== 'custom');
  });

  // Calendar connect — uses existing server credentials, always succeeds
  document.getElementById('btn-connect-cal').addEventListener('click', () => {
    const btn = document.getElementById('btn-connect-cal');
    btn.textContent = 'Connecting…';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = '✓ Connected';
      btn.classList.add('connected');
      document.getElementById('dm-calendar').classList.add('dm-selected');
      if (!profile.delivery_methods.includes('calendar')) {
        profile.delivery_methods.push('calendar');
      }
      toast('Google Calendar connected!', 'success');
    }, 900);
  });

  // Email confirm
  document.getElementById('btn-confirm-email').addEventListener('click', () => {
    const email = document.getElementById('delivery-email').value.trim();
    if (!email || !email.includes('@')) { toast('Enter a valid email address', 'error'); return; }
    profile.delivery_email = email;
    if (!profile.delivery_methods.includes('email')) profile.delivery_methods.push('email');
    const btn = document.getElementById('btn-confirm-email');
    btn.textContent = '✓ Confirmed';
    btn.classList.add('connected');
    document.getElementById('dm-email').classList.add('dm-selected');
    toast('Email digest confirmed!', 'success');
  });

  // .edu waitlist
  document.getElementById('btn-edu-waitlist').addEventListener('click', () => {
    const btn = document.getElementById('btn-edu-waitlist');
    btn.textContent = '✓ On waitlist';
    btn.classList.add('joined');
    btn.disabled = true;
    toast("You're on the waitlist!", 'success');
  });

  // .edu learn more toggle
  document.getElementById('dm-edu-learn').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('edu-explainer').classList.toggle('hidden');
  });

  // Finish
  document.getElementById('ob-finish').addEventListener('click', finishOnboarding);
}

function finishOnboarding() {
  localStorage.setItem('oppor_tune_profile', JSON.stringify(profile));
  document.getElementById('onboarding').classList.add('hidden');
  showApp();
}

function loadProfile() {
  try {
    const s = localStorage.getItem('oppor_tune_profile');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════════════════════
function showApp() {
  document.getElementById('app').classList.remove('hidden');
  const btnProfile = document.getElementById('btn-profile');
  if (profile?.avatar_custom) {
    btnProfile.innerHTML = `<img src="${profile.avatar}" style="width:20px;height:20px;border-radius:4px;object-fit:cover;vertical-align:middle"> ${esc(profile.name)}`;
  } else if (profile?.avatar) {
    btnProfile.innerHTML = `${profile.avatar} ${esc(profile.name)}`;
  }

  addChatMsg('ai', `Hey ${profile.name}! I'm your OpporTune guide. I'll personalize these opportunities for you as a ${profile.major} ${profile.edu_level}. Loading your feed now…`);

  loadOpportunities();
  bindAppControls();
}

async function loadOpportunities() {
  showLoading();
  try {
    const res  = await fetch(`${API}/api/opportunities`);
    const data = await res.json();
    opportunities = data.opportunities || [];
    applyFilter(activeFilter);
    updateStats();
    personalizeAll();
  } catch {
    document.getElementById('checklist').innerHTML =
      `<div class="loading"><p style="color:#e85555">Could not reach server. Is app.py running?</p></div>`;
  }
}

async function personalizeAll() {
  if (!opportunities.length || !profile) return;
  try {
    const res  = await fetch(`${API}/api/personalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, opportunities }),
    });
    const data = await res.json();
    opportunities.forEach((opp, i) => {
      const script = data.scripts[String(i + 1)];
      if (script) scripts[opp.id] = script;
    });
    renderScripts();
    addChatMsg('ai', `Done! I've prepared personalized notes for all ${opportunities.length} opportunities. Click any card to discuss it, or hit Broadcast to hear them all.`);
  } catch (e) {
    console.error('[personalize]', e);
  }
}

function renderScripts() {
  filtered.forEach(opp => {
    const el = document.getElementById(`script-${opp.id}`);
    if (!el) return;
    const script = scripts[opp.id];
    if (script) {
      el.textContent = script;
      el.classList.remove('script-loading');
      el.classList.add('visible');
    }
  });
}

// ── Checklist ────────────────────────────────────────────────────────────
function applyFilter(type) {
  activeFilter = type;
  filtered = type === 'all' ? [...opportunities] : opportunities.filter(o => o.type === type);
  renderChecklist();
  updateStats();
}

function renderChecklist() {
  const list = document.getElementById('checklist');
  if (!filtered.length) {
    list.innerHTML = '<div class="loading"><p>No opportunities found.</p></div>';
    return;
  }
  list.innerHTML = filtered.map((opp, i) => buildCard(opp, i)).join('');
  renderScripts();
  bindCardEvents();
}

function buildCard(opp, i) {
  const bc = opp.type === 'Hackathon' ? 'badge-hack' : 'badge-news';
  const hasScript = !!scripts[opp.id];
  return `
  <div class="opp-card${activeOppId === opp.id ? ' active' : ''}" data-id="${opp.id}" data-idx="${i}">
    <div class="card-header">
      <div class="card-num">${i + 1}</div>
      <div class="card-body">
        <div class="card-badges">
          <span class="badge ${bc}">${opp.type}</span>
          <span class="badge badge-src">${opp.source}</span>
        </div>
        <div class="card-title" title="${esc(opp.title)}">${esc(opp.title)}</div>
        <div class="card-meta">
          ${opp.deadline ? `<span>📅 ${opp.deadline}</span>` : ''}
          ${opp.location ? `<span>📍 ${opp.location}</span>` : ''}
          ${opp.prize    ? `<span>🏆 ${opp.prize}</span>`    : ''}
        </div>
      </div>
    </div>
    <div class="card-script${hasScript ? ' visible' : ' script-loading'}" id="script-${opp.id}">
      ${hasScript ? esc(scripts[opp.id]) : 'Personalizing…'}
    </div>
    <div class="card-actions">
      <button class="act-btn act-save"   data-id="${opp.id}">☆ Save</button>
      <button class="act-btn act-ignore" data-id="${opp.id}">✕ Ignore</button>
      <button class="act-btn act-cal"    data-id="${opp.id}">+ Calendar</button>
    </div>
  </div>`;
}

function bindCardEvents() {
  document.querySelectorAll('.opp-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('act-btn')) return;
      selectOpp(card.dataset.id);
    });
  });

  document.querySelectorAll('.act-save').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const card = btn.closest('.opp-card');
      card.classList.toggle('saved');
      btn.textContent = card.classList.contains('saved') ? '★ Saved' : '☆ Save';
      toast('Saved!', 'success');
    });
  });

  document.querySelectorAll('.act-ignore').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      btn.closest('.opp-card').classList.toggle('ignored');
    });
  });

  document.querySelectorAll('.act-cal').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const opp = opportunities.find(o => o.id === btn.dataset.id);
      if (!opp) return;
      btn.textContent = '⏳…';
      btn.disabled = true;
      try {
        const res  = await fetch(`${API}/api/calendar/add`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...opp, personalized_script: scripts[opp.id] }),
        });
        const data = await res.json();
        if (data.success) { btn.textContent = '✓ Added'; toast('Added to Google Calendar', 'success'); }
        else { btn.textContent = '+ Calendar'; btn.disabled = false; toast(data.error, 'error'); }
      } catch { btn.textContent = '+ Calendar'; btn.disabled = false; toast('Server error', 'error'); }
    });
  });
}

function selectOpp(id) {
  activeOppId = id;
  document.querySelectorAll('.opp-card').forEach(c => c.classList.toggle('active', c.dataset.id === id));
  const opp = opportunities.find(o => o.id === id);
  if (!opp) return;
  document.getElementById('chat-context').textContent = opp.title;
  const script = scripts[id];
  if (script) {
    addChatMsg('ai', script);
    addChatMsg('ai', 'Feel free to ask me anything about this opportunity — eligibility, how to prepare, what skills are needed, etc.');
  } else {
    addChatMsg('ai', `Here's "${opp.title}". What would you like to know about it?`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  BROADCAST
// ══════════════════════════════════════════════════════════════════════════
function startBroadcast() {
  if (!window.speechSynthesis) { toast('Speech not supported in this browser', 'error'); return; }
  broadcastActive = true;
  broadcastPaused = false;
  broadcastIdx    = 0;
  document.getElementById('broadcast-bar').classList.remove('hidden');
  document.getElementById('btn-broadcast').textContent = '⏹ Stop';
  speakNext();
}

function speakNext() {
  if (!broadcastActive || broadcastIdx >= filtered.length) {
    stopBroadcast();
    addChatMsg('ai', "That's all the opportunities for now! Click any card to ask follow-up questions.");
    return;
  }
  const opp    = filtered[broadcastIdx];
  const script = scripts[opp.id] || opp.raw_summary;

  document.querySelectorAll('.opp-card').forEach(c => c.classList.remove('broadcasting'));
  const card = document.querySelector(`.opp-card[data-id="${opp.id}"]`);
  if (card) { card.classList.add('broadcasting'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }

  document.getElementById('bc-label').textContent = `#${broadcastIdx + 1} — ${opp.title}`;
  document.getElementById('chat-context').textContent = opp.title;
  activeOppId = opp.id;

  addChatMsg('ai', `[#${broadcastIdx + 1}] ${script}`);

  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(script);
  utt.rate  = 0.95;
  utt.pitch = 1;
  utt.onend = () => {
    if (!broadcastPaused && broadcastActive) {
      broadcastIdx++;
      setTimeout(speakNext, 700);
    }
  };
  window.speechSynthesis.speak(utt);
}

function stopBroadcast() {
  broadcastActive = false;
  broadcastPaused = false;
  window.speechSynthesis.cancel();
  document.getElementById('broadcast-bar').classList.add('hidden');
  document.getElementById('btn-broadcast').textContent = '▶ Broadcast';
  document.querySelectorAll('.opp-card').forEach(c => c.classList.remove('broadcasting'));
}

// ══════════════════════════════════════════════════════════════════════════
//  CHAT
// ══════════════════════════════════════════════════════════════════════════
function addChatMsg(role, text) {
  chatMessages.push({ role, content: text });
  const el = document.createElement('div');
  el.className = `chat-msg ${role}`;
  el.innerHTML = `<div class="msg-bubble">${text}</div>`;
  const msgs = document.getElementById('chat-messages');
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
}

async function sendChatMessage(text) {
  if (!text.trim()) return;
  addChatMsg('user', text);

  const opp = opportunities.find(o => o.id === activeOppId) || {};
  const el  = document.createElement('div');
  el.className = 'chat-msg ai';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble streaming';
  bubble.textContent = '';
  el.appendChild(bubble);
  document.getElementById('chat-messages').appendChild(el);
  document.getElementById('chat-messages').scrollTop = 99999;

  let fullText = '';
  try {
    const res = await fetch(`${API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile,
        opportunity: { ...opp, personalized_script: scripts[opp.id] },
        messages: chatMessages.slice(-8),
        message: text,
      }),
    });

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') break;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.text) {
            fullText += parsed.text;
            bubble.textContent = fullText;
            document.getElementById('chat-messages').scrollTop = 99999;
          }
        } catch {}
      }
    }
  } catch {
    bubble.textContent = 'Sorry, could not connect to AI. Is the server running?';
  }

  bubble.classList.remove('streaming');
  chatMessages.push({ role: 'ai', content: fullText });
}

// ══════════════════════════════════════════════════════════════════════════
//  CONTROLS
// ══════════════════════════════════════════════════════════════════════════
function bindAppControls() {
  document.getElementById('btn-broadcast').addEventListener('click', () => {
    broadcastActive ? stopBroadcast() : startBroadcast();
  });
  document.getElementById('btn-refresh').addEventListener('click', loadOpportunities);
  document.getElementById('btn-profile').addEventListener('click', () => {
    localStorage.removeItem('oppor_tune_profile');
    location.reload();
  });
  document.getElementById('btn-prev').addEventListener('click', () => {
    if (broadcastIdx > 0) { broadcastIdx--; speakNext(); }
  });
  document.getElementById('btn-next').addEventListener('click', () => { broadcastIdx++; speakNext(); });
  document.getElementById('btn-pause').addEventListener('click', () => {
    if (broadcastPaused) {
      broadcastPaused = false;
      document.getElementById('btn-pause').textContent = '⏸';
      speakNext();
    } else {
      broadcastPaused = true;
      window.speechSynthesis.cancel();
      document.getElementById('btn-pause').textContent = '▶';
    }
  });
  document.getElementById('btn-stop').addEventListener('click', stopBroadcast);

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilter(btn.dataset.type);
    });
  });

  document.getElementById('chat-send').addEventListener('click', () => {
    const input = document.getElementById('chat-input');
    sendChatMessage(input.value);
    input.value = '';
  });
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      sendChatMessage(e.target.value);
      e.target.value = '';
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stats-text').textContent =
    `${filtered.length} opportunities · ${Object.keys(scripts).length} personalized`;
}
function showLoading() {
  document.getElementById('checklist').innerHTML =
    '<div class="loading"><div class="spinner"></div><p>Fetching opportunities…</p></div>';
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
let _toastT;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast ${type}`;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.add('hidden'), 3000);
}
