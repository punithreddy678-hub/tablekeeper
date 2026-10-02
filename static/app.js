const $=s=>document.querySelector(s);
let restaurants=[];
let selectedTable=null;
let selectedRestaurant=null;
let currentOwner=null;
let currentUser=null;
let googleClientId='';
let ownerFilterStatus='ALL';
let currentOwnerReservations=[];

function parseTime(timeStr){
    if(!timeStr) return '19:00:00';
    const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if(!match) return '19:00:00';
    let [_, h, m, ampm] = match;
    let hours = parseInt(h, 10);
    if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }
    return `${String(hours).padStart(2, '0')}:${m}:00`;
}

function getDateVal(){
    return $('#date')?.value || '2026-09-28';
}

function getPartyCount(){
    const val = $('#party')?.value || '2 guests';
    const num = parseInt(val, 10);
    return isNaN(num) ? 2 : num;
}

// Initial Load
async function initApp(){
    await fetchAuthConfig();
    await checkUserAuth();
    await checkOwnerAuth();
    await loadRestaurants();
    await loadReservations();
}

// Google Client ID Config
async function fetchAuthConfig(){
    try {
        const res = await fetch('/api/auth/config');
        const data = await res.json();
        googleClientId = data.google_client_id || localStorage.getItem('tk_google_client_id') || '';
        if($('#googleClientIdInput')){
            $('#googleClientIdInput').value = googleClientId;
        }
    } catch(e){}
}

function saveGoogleClientId(){
    const inputVal = $('#googleClientIdInput')?.value?.trim();
    if(!inputVal){
        toast('Please enter a valid Google Client ID.');
        return;
    }
    googleClientId = inputVal;
    localStorage.setItem('tk_google_client_id', inputVal);
    toast('Google Client ID saved!');
    initGoogleAuth();
}

// Unified Header UI Manager
function updateHeaderNavUI(){
    const isOwnerPortalActive = !$('#ownerPortal').hidden;

    if(isOwnerPortalActive){
        $('#userBadgeNav').hidden = true;
        $('#dinerAuthBtn').hidden = true;

        if(currentOwner){
            $('#ownerBadgeNav').hidden = false;
            $('#ownerNavName').textContent = currentOwner.restaurant_name;
        } else {
            $('#ownerBadgeNav').hidden = true;
        }
    } else {
        $('#ownerBadgeNav').hidden = true;

        if(currentUser){
            $('#userBadgeNav').hidden = false;
            $('#userNavName').textContent = currentUser.name;
            const img = $('#userNavAvatar');
            const fallback = $('#userNavAvatarFallback');
            if(currentUser.picture){
                img.src = currentUser.picture;
                img.style.display = 'inline-block';
                if(fallback) fallback.style.display = 'none';
            } else {
                img.style.display = 'none';
                if(fallback) fallback.style.display = 'inline-flex';
            }
            $('#dinerAuthBtn').hidden = true;
        } else {
            $('#userBadgeNav').hidden = true;
            $('#dinerAuthBtn').hidden = false;
        }
    }
}

// User Google Auth
async function checkUserAuth(){
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if(data.authenticated && data.user){
            currentUser = data.user;
        } else {
            currentUser = null;
        }
    } catch(e){
        currentUser = null;
    }
    updateHeaderNavUI();
}

function initGoogleAuth(){
    const cid = googleClientId || $('#googleClientIdInput')?.value || localStorage.getItem('tk_google_client_id');
    const container = $('#googleBtnContainer');
    
    if(!cid){
        if(container){
            container.innerHTML = `<p class="meta" style="color: var(--muted); text-align: center; margin: 10px 0;">Enter your Google OAuth Client ID below to display the live Google Sign-In button.</p>`;
        }
        return;
    }

    if (window.google && window.google.accounts && window.google.accounts.id) {
        google.accounts.id.initialize({
            client_id: cid,
            callback: handleGoogleCredentialResponse,
            auto_select: false
        });

        if(container){
            container.innerHTML = '';
            google.accounts.id.renderButton(
                container,
                { theme: "outline", size: "large", width: 340, text: "continue_with", shape: "pill" }
            );
        }
    } else {
        setTimeout(initGoogleAuth, 500);
    }
}

async function handleGoogleCredentialResponse(response){
    if(!response || !response.credential) return;

    $('#authStatus').textContent = 'Verifying Google account with server...';

    try {
        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_token: response.credential,
                client_id: googleClientId
            })
        });
        const data = await res.json();
        if(res.ok && data.user){
            currentUser = data.user;
            updateHeaderNavUI();
            closeAuth();
            toast(`Signed in with Google as ${currentUser.name}!`);
            loadReservations();
        } else {
            $('#authStatus').textContent = data.message || 'Google verification failed.';
        }
    } catch(e) {
        $('#authStatus').textContent = 'Error verifying Google account.';
    }
}

async function googleUserLogout(e){
    if(e && e.stopPropagation) e.stopPropagation();
    currentUser = null;
    updateHeaderNavUI();
    try {
        if(window.google && window.google.accounts && window.google.accounts.id){
            window.google.accounts.id.disableAutoSelect();
        }
    } catch(err){}
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch(err){}
    await loadReservations();
    toast('Logged out');
}

// Owner Authentication
async function checkOwnerAuth(){
    try {
        const res = await fetch('/api/owner/me');
        const data = await res.json();
        if(data.authenticated && data.owner){
            currentOwner = data.owner;
        } else {
            currentOwner = null;
        }
    } catch(e) {
        currentOwner = null;
    }
    updateHeaderNavUI();
}

function togglePortalView(){
    const isOwnerVisible = !$('#ownerPortal').hidden;
    if(!isOwnerVisible){
        if(!currentOwner){
            openOwnerAuth();
        } else {
            showOwnerPortal();
        }
    } else {
        showDinerView();
    }
}

function showOwnerPortal(){
    $('#dinerView').hidden = true;
    $('#dinerNav').hidden = true;
    $('#ownerPortal').hidden = false;
    $('#portalBtn').innerHTML = '<span class="icon">🍽️</span> Diner View';
    if(currentOwner){
        $('#portalRestName').textContent = currentOwner.restaurant_name;
        $('#portalRestMeta').textContent = `Owner: ${currentOwner.name} · ${currentOwner.cuisine} Cuisine`;
        $('#portalOwnerName').textContent = currentOwner.name;
    }
    updateHeaderNavUI();
    loadOwnerDashboard();
}

function showDinerView(){
    $('#dinerView').hidden = false;
    $('#dinerNav').hidden = false;
    $('#ownerPortal').hidden = true;
    $('#portalBtn').innerHTML = '<span class="icon">💼</span> Partner Portal';
    updateHeaderNavUI();
}

function openAuth(){
    $('#authModal').hidden = false;
    $('#authStatus').textContent = '';
    initGoogleAuth();
}

function closeAuth(){
    $('#authModal').hidden = true;
}

function openOwnerAuth(){
    $('#ownerAuthModal').hidden = false;
    $('#ownerAuthError').textContent = '';
}

function closeOwnerAuth(){
    $('#ownerAuthModal').hidden = true;
}

async function quickOwnerLogin(email, password){
    $('#ownerEmail').value = email;
    $('#ownerPassword').value = password;
    await performOwnerLogin(email, password);
}

async function handleOwnerLoginSubmit(e){
    e.preventDefault();
    const email = $('#ownerEmail').value;
    const password = $('#ownerPassword').value;
    await performOwnerLogin(email, password);
}

async function performOwnerLogin(email, password){
    $('#ownerAuthError').textContent = '';
    const res = await fetch('/api/owner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if(res.ok && data.owner){
        currentOwner = data.owner;
        closeOwnerAuth();
        toast(`Welcome back, ${currentOwner.name}!`);
        showOwnerPortal();
    } else {
        $('#ownerAuthError').textContent = data.message || 'Login failed.';
    }
}

async function ownerLogout(e){
    if(e && e.stopPropagation) e.stopPropagation();
    currentOwner = null;
    showDinerView();
    updateHeaderNavUI();
    try {
        await fetch('/api/owner/logout', { method: 'POST' });
    } catch(err){}
    toast('Logged out of owner portal');
}

// Owner Dashboard Methods
async function loadOwnerDashboard(){
    if(!currentOwner) return;
    const res = await fetch('/api/owner/reservations');
    if(!res.ok) return;
    currentOwnerReservations = await res.json();

    const pendingCount = currentOwnerReservations.filter(r=>r.status==='pending').length;
    const confirmedCount = currentOwnerReservations.filter(r=>r.status==='confirmed').length;
    const declinedCount = currentOwnerReservations.filter(r=>r.status==='declined' || r.status==='cancelled').length;

    $('#countPending').textContent = pendingCount;
    $('#tabCountPending').textContent = pendingCount;
    $('#countConfirmed').textContent = confirmedCount;
    $('#countDeclined').textContent = declinedCount;

    renderOwnerReservations();
}

function filterOwnerTab(status, el){
    ownerFilterStatus = status;
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    if(el) el.classList.add('active');
    renderOwnerReservations();
}

function renderOwnerReservations(){
    let items = currentOwnerReservations;
    if(ownerFilterStatus !== 'ALL'){
        items = items.filter(r=>r.status === ownerFilterStatus);
    }

    if(items.length === 0){
        $('#ownerResList').innerHTML = '<p class="meta" style="padding: 20px; text-align: center;">No booking requests in this view.</p>';
        return;
    }

    $('#ownerResList').innerHTML = items.map(r=>{
        const isPending = r.status === 'pending';
        let statusBadgeClass = 'status-pending';
        let statusText = 'Pending Approval';
        if(r.status === 'confirmed'){ statusBadgeClass = 'status-confirmed'; statusText = 'Confirmed'; }
        if(r.status === 'declined'){ statusBadgeClass = 'status-declined'; statusText = 'Declined'; }
        if(r.status === 'cancelled'){ statusBadgeClass = 'status-cancelled'; statusText = 'Cancelled'; }

        return `<div class="owner-res-card">
            <div class="guest-details">
                <strong>${r.guest_name}</strong>
                <small>${r.guest_email} · ${r.guest_phone || 'No phone'}</small>
            </div>
            <div class="table-details">
                <span>Table ${r.table_number}</span>
                <small>${r.guest_count} guests (Max ${r.table_capacity})</small>
            </div>
            <div class="time-details">
                <span>${new Date(r.start_time).toLocaleDateString(undefined, {month:'short', day:'numeric'})} @ ${new Date(r.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                <span class="status-pill ${statusBadgeClass}" style="margin-top: 4px;">${statusText}</span>
            </div>
            <div class="action-btns">
                ${isPending ? `
                    <button class="btn-accept" onclick="ownerAccept('${r.id}')">✓ Accept</button>
                    <button class="btn-decline" onclick="ownerDecline('${r.id}')">✕ Decline</button>
                ` : `
                    <small class="meta">${new Date(r.updated_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</small>
                `}
            </div>
        </div>`;
    }).join('');
}

async function ownerAccept(rid){
    const res = await fetch(`/api/owner/reservations/${rid}/accept`, { method: 'POST' });
    const data = await res.json();
    if(res.ok){
        toast('Reservation accepted & confirmed!');
        await loadOwnerDashboard();
        await loadReservations();
    } else {
        toast(data.message || 'Action failed.');
    }
}

async function ownerDecline(rid){
    const res = await fetch(`/api/owner/reservations/${rid}/decline`, { method: 'POST' });
    const data = await res.json();
    if(res.ok){
        toast('Reservation declined.');
        await loadOwnerDashboard();
        await loadReservations();
    } else {
        toast(data.message || 'Action failed.');
    }
}

// Guest Diner Functionality
async function loadRestaurants(){
    const r=await fetch('/api/restaurants');
    restaurants=await r.json();
    renderRestaurants(restaurants);
}

function renderRestaurants(items){
    $('#cards').innerHTML=items.map(r=>`<article class="card" onclick="book(${r.id})"><img src="${r.image}" alt="${r.name}"><div class="card-body"><div class="card-top"><h3>${r.name}</h3><strong>★ ${r.rating}</strong></div><div class="meta">${r.cuisine} · ${r.address} · ${r.price_range}</div><p class="meta">${r.description}</p><div class="slots"><button class="slot" onclick="event.stopPropagation();openTablePicker(${r.id})">Choose a table</button><span class="slot">6:30 PM</span><span class="slot">7:00 PM</span><span class="slot">7:30 PM</span></div></div></article>`).join('');
}

function discover(){
    const q=$('#q').value.toLowerCase();
    renderRestaurants(restaurants.filter(r=>!q||(`${r.name} ${r.cuisine} ${r.address}`).toLowerCase().includes(q)));
    document.querySelector('#discover').scrollIntoView({behavior:'smooth'});
}

async function openTablePicker(id){
    selectedRestaurant=id;
    selectedTable=null;
    const dateVal = getDateVal();
    const timeVal = parseTime($('#time')?.value || '7:00 PM');
    const partyCount = getPartyCount();
    
    const r=await fetch(`/api/restaurants/${id}?date=${dateVal}&time=${timeVal}`);
    const data=await r.json();
    const picker=$('#tablePicker');
    picker.hidden=false;
    picker.innerHTML=`<div class="picker-head"><div><span class="eyebrow">SELECT YOUR TABLE</span><h2>${data.name}</h2><p class="meta">Pick a table that fits your party. Reserved/unavailable tables are disabled.</p></div><button class="outline" onclick="closeTablePicker()">Close</button></div><div class="table-grid">${data.tables.map(t=>{
        const isUnavailable = t.status !== 'available' || t.capacity < partyCount;
        const statusText = t.capacity < partyCount ? 'Too small' : t.status;
        return `<button class="table-choice ${isUnavailable?'disabled':''}" ${isUnavailable?'disabled':''} onclick="selectTable(${t.id},'${t.table_number}',${t.capacity})"><strong>Table ${t.table_number}</strong><span>Seats ${t.capacity}</span><small>${statusText}</small></button>`;
    }).join('')}</div><div class="picker-actions"><span id="selectedTableText">No table selected</span><button id="reserveSelected" class="btn-primary" disabled onclick="reserveSelectedTable()">Request Reservation →</button></div>`;
    picker.scrollIntoView({behavior:'smooth',block:'center'});
}

function closeTablePicker(){
    const p=$('#tablePicker');
    p.hidden=true;
    p.innerHTML='';
    selectedTable=null;
}

function selectTable(id,number,capacity){
    selectedTable={id,number,capacity};
    document.querySelectorAll('.table-choice').forEach(x=>x.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    $('#selectedTableText').textContent=`Table ${number} selected · ${capacity} seats`;
    $('#reserveSelected').disabled=false;
}

async function reserveSelectedTable(){
    if(!selectedTable||!selectedRestaurant) return;
    const r=restaurants.find(x=>x.id===selectedRestaurant);
    const offset={
        'America/New_York':'-04:00',
        'America/Chicago':'-05:00',
        'America/Los_Angeles':'-07:00',
        'Asia/Kolkata':'+05:30',
        'Asia/Tokyo':'+09:00'
    }[r.timezone]||'+00:00';
    
    const dateVal = getDateVal();
    const timeVal = parseTime($('#time')?.value || '7:00 PM');
    const partyCount = getPartyCount();
    
    const [h, m, s] = timeVal.split(':').map(Number);
    const endH = String((h + 1) % 24).padStart(2, '0');
    const endTimeVal = `${endH}:${String(m).padStart(2, '0')}:00`;
    
    const guestEmail = currentUser ? currentUser.email : 'demo@tablekeeper.local';
    const guestName = currentUser ? currentUser.name : 'Demo Guest';
    
    const idem='ui-'+crypto.randomUUID();
    const payload={
        restaurant_id:selectedRestaurant,
        table_id:selectedTable.id,
        start_time:`${dateVal}T${timeVal}${offset}`,
        end_time:`${dateVal}T${endTimeVal}${offset}`,
        guest_count:Math.min(partyCount, selectedTable.capacity),
        name:guestName,
        email:guestEmail,
        status: 'pending'
    };
    
    const res=await fetch('/api/reservations',{
        method:'POST',
        headers:{
            'Content-Type':'application/json',
            'Idempotency-Key':idem
        },
        body:JSON.stringify(payload)
    });
    
    const data=await res.json();
    toast(res.ok ? 'Reservation request submitted! Pending restaurant approval.' : data.message);
    if(res.ok) closeTablePicker();
    loadReservations();
    if(currentOwner) loadOwnerDashboard();
}

async function book(id){
    openTablePicker(id);
}

async function loadReservations(){
    const r=await fetch('/api/reservations');
    const data=await r.json();
    if(!data || data.length === 0){
        $('#resList').innerHTML = '<p class="meta">No reservations yet. Pick a restaurant above.</p>';
        return;
    }

    $('#resList').innerHTML=data.map(x=>{
        let badgeClass = 'status-pending';
        let badgeText = 'Pending Approval';
        if(x.status === 'confirmed'){ badgeClass = 'status-confirmed'; badgeText = 'Confirmed'; }
        if(x.status === 'declined'){ badgeClass = 'status-declined'; badgeText = 'Declined'; }
        if(x.status === 'cancelled'){ badgeClass = 'status-cancelled'; badgeText = 'Cancelled'; }

        const canCancel = x.status === 'confirmed' || x.status === 'pending';

        return `<div class="reservation">
            <div class="reservation-info">
                <strong>${x.restaurant_name}</strong>
                <small>${new Date(x.start_time).toLocaleString()} · ${x.guest_count} guests · Table ${x.table_number}</small>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <span class="status-pill ${badgeClass}">${badgeText}</span>
                ${canCancel ? `<button class="cancel" onclick="cancelRes('${x.id}')">Cancel</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

async function cancelRes(id){
    await fetch('/api/reservations/'+id+'/cancel',{method:'POST'});
    loadReservations();
    if(currentOwner) loadOwnerDashboard();
    toast('Reservation cancelled');
}

async function runConcurrency(){
    const n=+$('#req').value;
    $('#labResult').innerHTML='<strong>Running…</strong><p>Sending '+n+' simultaneous booking attempts.</p>';
    const r=await fetch('/api/concurrency-test',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({requests:n,restaurant_id:+$('#labRestaurant').value})
    });
    const d=await r.json();
    $('#labResult').innerHTML=`<strong>${d.successful} winner</strong><p>${d.requests} concurrent requests sent · ${d.rejected} rejected</p><div class="slot">${d.double_booking_prevented?'✓ DOUBLE BOOKING PREVENTED':'⚠ CHECK RESULT'}</div>`;
    loadReservations();
    if(currentOwner) loadOwnerDashboard();
}

async function runIdem(){
    const r=await fetch('/api/idempotency-test',{method:'POST'});
    const d=await r.json();
    $('#idemResult').innerHTML=`<div class="slot" style="margin-top:14px">${d.reservations_created} reservation created · ${d.duplicate_reservations} duplicates</div>`;
    loadReservations();
    if(currentOwner) loadOwnerDashboard();
}

function toast(msg){
    const t=$('#toast');
    t.textContent=msg;
    t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'),2800);
}

// Run App
initApp();
