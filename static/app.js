const $=s=>document.querySelector(s);
let restaurants=[];
let selectedTable=null;
let selectedRestaurant=null;
let currentOwner=null;
let currentUser=null;
let googleClientId='';
let ownerFilterStatus='ALL';
let currentOwnerReservations=[];

const MOCK_RESTAURANTS = [
  { id: 1, name: 'The Olive Garden', description: 'Handmade pasta, candlelight and a warm Italian table.', address: 'Downtown · 18 Market Street', timezone: 'America/New_York', cuisine: 'Italian', price_range: '$$$', rating: 4.7, image: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=85', hours: '11:30 AM – 10:30 PM' },
  { id: 2, name: 'Juniper & Co.', description: 'Seasonal plates, bright herbs and modern American comfort.', address: 'Riverside · 7 Willow Lane', timezone: 'America/Chicago', cuisine: 'American', price_range: '$$', rating: 4.8, image: 'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=85', hours: '5:00 PM – 11:00 PM' },
  { id: 3, name: 'Saffron House', description: 'North Indian classics with a contemporary tasting-menu twist.', address: 'Arts District · 42 Lotus Ave', timezone: 'Asia/Kolkata', cuisine: 'Indian', price_range: '$$', rating: 4.6, image: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1200&q=85', hours: '12:00 PM – 10:00 PM' },
  { id: 4, name: 'Kumo', description: 'Intimate Japanese dining, omakase and robata.', address: 'Midtown · 91 Pine Street', timezone: 'Asia/Tokyo', cuisine: 'Japanese', price_range: '$$$$', rating: 4.9, image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=85', hours: '6:00 PM – 11:00 PM' },
  { id: 5, name: 'Casa Verde', description: 'Vibrant coastal Mexican food, agave cocktails and tacos.', address: 'Old Town · 12 Verde Plaza', timezone: 'America/Los_Angeles', cuisine: 'Mexican', price_range: '$$', rating: 4.5, image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=1200&q=85', hours: '11:00 AM – 11:00 PM' }
];

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
        if(!res.ok) throw new Error();
        const data = await res.json();
        googleClientId = data.google_client_id || localStorage.getItem('tk_google_client_id') || '';
    } catch(e){
        googleClientId = localStorage.getItem('tk_google_client_id') || '';
    }
    if($('#googleClientIdInput')){
        $('#googleClientIdInput').value = googleClientId;
    }
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
    const isOwnerPortalActive = $('#ownerPortal') && !$('#ownerPortal').hidden;

    if(isOwnerPortalActive){
        if($('#userBadgeNav')) $('#userBadgeNav').hidden = true;
        if($('#dinerAuthBtn')) $('#dinerAuthBtn').hidden = true;

        if(currentOwner){
            if($('#ownerBadgeNav')) $('#ownerBadgeNav').hidden = false;
            if($('#ownerNavName')) $('#ownerNavName').textContent = currentOwner.restaurant_name;
        } else {
            if($('#ownerBadgeNav')) $('#ownerBadgeNav').hidden = true;
        }
    } else {
        if($('#ownerBadgeNav')) $('#ownerBadgeNav').hidden = true;

        if(currentUser){
            if($('#userBadgeNav')) $('#userBadgeNav').hidden = false;
            if($('#userNavName')) $('#userNavName').textContent = currentUser.name;
            const img = $('#userNavAvatar');
            const fallback = $('#userNavAvatarFallback');
            if(currentUser.picture){
                if(img) { img.src = currentUser.picture; img.style.display = 'inline-block'; }
                if(fallback) fallback.style.display = 'none';
            } else {
                if(img) img.style.display = 'none';
                if(fallback) fallback.style.display = 'inline-flex';
            }
            if($('#dinerAuthBtn')) $('#dinerAuthBtn').hidden = true;
        } else {
            if($('#userBadgeNav')) $('#userBadgeNav').hidden = true;
            if($('#dinerAuthBtn')) $('#dinerAuthBtn').hidden = false;
        }
    }
}

// User Google Auth
async function checkUserAuth(){
    try {
        const res = await fetch('/api/auth/me');
        if(!res.ok) throw new Error();
        const data = await res.json();
        if(data.authenticated && data.user){
            currentUser = data.user;
        } else {
            currentUser = null;
        }
    } catch(e){
        currentUser = JSON.parse(localStorage.getItem('tk_local_user') || 'null');
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

    if($('#authStatus')) $('#authStatus').textContent = 'Verifying Google account...';

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
            return;
        }
    } catch(e) {}

    // Fallback for static demo mode
    currentUser = { name: "Demo User", email: "demo@tablekeeper.local" };
    localStorage.setItem('tk_local_user', JSON.stringify(currentUser));
    updateHeaderNavUI();
    closeAuth();
    toast('Signed in as Demo User!');
    loadReservations();
}

async function googleUserLogout(e){
    if(e && e.stopPropagation) e.stopPropagation();
    currentUser = null;
    localStorage.removeItem('tk_local_user');
    updateHeaderNavUI();
    try {
        if(window.google && window.google.accounts && window.google.accounts.id){
            window.google.accounts.id.disableAutoSelect();
        }
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch(err){}
    await loadReservations();
    toast('Logged out');
}

// Owner Authentication
async function checkOwnerAuth(){
    try {
        const res = await fetch('/api/owner/me');
        if(!res.ok) throw new Error();
        const data = await res.json();
        if(data.authenticated && data.owner){
            currentOwner = data.owner;
        } else {
            currentOwner = null;
        }
    } catch(e) {
        currentOwner = JSON.parse(localStorage.getItem('tk_local_owner') || 'null');
    }
    updateHeaderNavUI();
}

function togglePortalView(){
    const isOwnerVisible = $('#ownerPortal') && !$('#ownerPortal').hidden;
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
    if($('#dinerView')) $('#dinerView').hidden = true;
    if($('#dinerNav')) $('#dinerNav').hidden = true;
    if($('#ownerPortal')) $('#ownerPortal').hidden = false;
    if($('#portalBtn')) $('#portalBtn').innerHTML = '<span class="icon">🍽️</span> Diner View';
    if(currentOwner){
        if($('#portalRestName')) $('#portalRestName').textContent = currentOwner.restaurant_name;
        if($('#portalRestMeta')) $('#portalRestMeta').textContent = `Owner: ${currentOwner.name} · ${currentOwner.cuisine || 'Restaurant'} Cuisine`;
        if($('#portalOwnerName')) $('#portalOwnerName').textContent = currentOwner.name;
    }
    updateHeaderNavUI();
    loadOwnerDashboard();
}

function showDinerView(){
    if($('#dinerView')) $('#dinerView').hidden = false;
    if($('#dinerNav')) $('#dinerNav').hidden = false;
    if($('#ownerPortal')) $('#ownerPortal').hidden = true;
    if($('#portalBtn')) $('#portalBtn').innerHTML = '<span class="icon">💼</span> Partner Portal';
    updateHeaderNavUI();
}

function openAuth(){
    if($('#authModal')) $('#authModal').hidden = false;
    if($('#authStatus')) $('#authStatus').textContent = '';
    initGoogleAuth();
}

function closeAuth(){
    if($('#authModal')) $('#authModal').hidden = true;
}

function openOwnerAuth(){
    if($('#ownerAuthModal')) $('#ownerAuthModal').hidden = false;
    if($('#ownerAuthError')) $('#ownerAuthError').textContent = '';
}

function closeOwnerAuth(){
    if($('#ownerAuthModal')) $('#ownerAuthModal').hidden = true;
}

async function quickOwnerLogin(email, password){
    if($('#ownerEmail')) $('#ownerEmail').value = email;
    if($('#ownerPassword')) $('#ownerPassword').value = password;
    await performOwnerLogin(email, password);
}

async function handleOwnerLoginSubmit(e){
    e.preventDefault();
    const email = $('#ownerEmail')?.value;
    const password = $('#ownerPassword')?.value;
    await performOwnerLogin(email, password);
}

async function performOwnerLogin(email, password){
    if($('#ownerAuthError')) $('#ownerAuthError').textContent = '';
    try {
        const res = await fetch('/api/owner/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if(res.ok && data.owner){
            currentOwner = data.owner;
            localStorage.setItem('tk_local_owner', JSON.stringify(currentOwner));
            closeOwnerAuth();
            toast(`Welcome back, ${currentOwner.name}!`);
            showOwnerPortal();
            return;
        }
    } catch(err){}

    // Fallback for demo static mode
    const mockOwners = {
        'olive@tablekeeper.local': { name: 'Marco Rossi', restaurant_name: 'The Olive Garden', cuisine: 'Italian' },
        'juniper@tablekeeper.local': { name: 'Sarah Jenkins', restaurant_name: 'Juniper & Co.', cuisine: 'American' },
        'saffron@tablekeeper.local': { name: 'Rajesh Kumar', restaurant_name: 'Saffron House', cuisine: 'Indian' },
        'kumo@tablekeeper.local': { name: 'Kenji Sato', restaurant_name: 'Kumo', cuisine: 'Japanese' },
        'casa@tablekeeper.local': { name: 'Elena Gomez', restaurant_name: 'Casa Verde', cuisine: 'Mexican' }
    };

    const owner = mockOwners[email] || { name: 'Restaurant Owner', restaurant_name: 'Partner Restaurant', cuisine: 'Gourmet' };
    currentOwner = owner;
    localStorage.setItem('tk_local_owner', JSON.stringify(currentOwner));
    closeOwnerAuth();
    toast(`Welcome back, ${currentOwner.name}!`);
    showOwnerPortal();
}

async function ownerLogout(e){
    if(e && e.stopPropagation) e.stopPropagation();
    currentOwner = null;
    localStorage.removeItem('tk_local_owner');
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
    try {
        const res = await fetch('/api/owner/reservations');
        if(res.ok){
            currentOwnerReservations = await res.json();
        } else {
            throw new Error();
        }
    } catch(err){
        currentOwnerReservations = JSON.parse(localStorage.getItem('tk_local_res') || '[]');
    }

    const pendingCount = currentOwnerReservations.filter(r=>r.status==='pending').length;
    const confirmedCount = currentOwnerReservations.filter(r=>r.status==='confirmed').length;
    const declinedCount = currentOwnerReservations.filter(r=>r.status==='declined' || r.status==='cancelled').length;

    if($('#countPending')) $('#countPending').textContent = pendingCount;
    if($('#tabCountPending')) $('#tabCountPending').textContent = pendingCount;
    if($('#countConfirmed')) $('#countConfirmed').textContent = confirmedCount;
    if($('#countDeclined')) $('#countDeclined').textContent = declinedCount;

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
        if($('#ownerResList')) $('#ownerResList').innerHTML = '<p class="meta" style="padding: 20px; text-align: center;">No booking requests in this view.</p>';
        return;
    }

    if($('#ownerResList')) {
        $('#ownerResList').innerHTML = items.map(r=>{
            const isPending = r.status === 'pending';
            let statusBadgeClass = 'status-pending';
            let statusText = 'Pending Approval';
            if(r.status === 'confirmed'){ statusBadgeClass = 'status-confirmed'; statusText = 'Confirmed'; }
            if(r.status === 'declined'){ statusBadgeClass = 'status-declined'; statusText = 'Declined'; }
            if(r.status === 'cancelled'){ statusBadgeClass = 'status-cancelled'; statusText = 'Cancelled'; }

            return `<div class="owner-res-card">
                <div class="guest-details">
                    <strong>${r.guest_name || 'Guest'}</strong>
                    <small>${r.guest_email || 'demo@tablekeeper.local'}</small>
                </div>
                <div class="table-details">
                    <span>Table ${r.table_number || '01'}</span>
                    <small>${r.guest_count || 2} guests</small>
                </div>
                <div class="time-details">
                    <span>${new Date(r.start_time || Date.now()).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                    <span class="status-pill ${statusBadgeClass}" style="margin-top: 4px;">${statusText}</span>
                </div>
                <div class="action-btns">
                    ${isPending ? `
                        <button class="btn-accept" onclick="ownerAccept('${r.id}')">✓ Accept</button>
                        <button class="btn-decline" onclick="ownerDecline('${r.id}')">✕ Decline</button>
                    ` : `
                        <small class="meta">Processed</small>
                    `}
                </div>
            </div>`;
        }).join('');
    }
}

async function ownerAccept(rid){
    try {
        const res = await fetch(`/api/owner/reservations/${rid}/accept`, { method: 'POST' });
        if(res.ok){
            toast('Reservation accepted & confirmed!');
            await loadOwnerDashboard();
            await loadReservations();
            return;
        }
    } catch(e){}

    let resList = JSON.parse(localStorage.getItem('tk_local_res') || '[]');
    resList = resList.map(r => r.id === rid ? { ...r, status: 'confirmed' } : r);
    localStorage.setItem('tk_local_res', JSON.stringify(resList));
    toast('Reservation accepted & confirmed!');
    await loadOwnerDashboard();
    await loadReservations();
}

async function ownerDecline(rid){
    try {
        const res = await fetch(`/api/owner/reservations/${rid}/decline`, { method: 'POST' });
        if(res.ok){
            toast('Reservation declined.');
            await loadOwnerDashboard();
            await loadReservations();
            return;
        }
    } catch(e){}

    let resList = JSON.parse(localStorage.getItem('tk_local_res') || '[]');
    resList = resList.map(r => r.id === rid ? { ...r, status: 'declined' } : r);
    localStorage.setItem('tk_local_res', JSON.stringify(resList));
    toast('Reservation declined.');
    await loadOwnerDashboard();
    await loadReservations();
}

// Guest Diner Functionality
async function loadRestaurants(){
    try {
        const r = await fetch('/api/restaurants');
        if(!r.ok) throw new Error();
        restaurants = await r.json();
    } catch(e){
        restaurants = MOCK_RESTAURANTS;
    }
    renderRestaurants(restaurants);
}

function renderRestaurants(items){
    if($('#grid')) {
        $('#grid').innerHTML = items.map(r=>`<article class="card" onclick="book(${r.id})"><img src="${r.image}" alt="${r.name}"><div class="card-body"><div class="card-top"><h3>${r.name}</h3><strong>★ ${r.rating}</strong></div><div class="meta">${r.cuisine} · ${r.address} · ${r.price_range}</div><p class="meta">${r.description}</p><div class="slots"><button class="slot" onclick="event.stopPropagation();openTablePicker(${r.id})">Choose a table</button><span class="slot">6:30 PM</span><span class="slot">7:00 PM</span><span class="slot">7:30 PM</span></div></div></article>`).join('');
    }
}

function discover(){
    const q = $('#q')?.value.toLowerCase() || '';
    renderRestaurants(restaurants.filter(r=>!q||(`${r.name} ${r.cuisine} ${r.address}`).toLowerCase().includes(q)));
    document.querySelector('#discover')?.scrollIntoView({behavior:'smooth'});
}

async function openTablePicker(id){
    selectedRestaurant = id;
    selectedTable = null;
    let data;
    try {
        const dateVal = getDateVal();
        const timeVal = parseTime($('#time')?.value || '7:00 PM');
        const r = await fetch(`/api/restaurants/${id}?date=${dateVal}&time=${timeVal}`);
        if(!r.ok) throw new Error();
        data = await r.json();
    } catch(e){
        const rObj = restaurants.find(x => x.id === id) || MOCK_RESTAURANTS[0];
        data = {
            id: rObj.id,
            name: rObj.name,
            tables: [
                { id: 1, table_number: '01', capacity: 2, status: 'available' },
                { id: 2, table_number: '02', capacity: 2, status: 'available' },
                { id: 3, table_number: '03', capacity: 4, status: 'available' },
                { id: 4, table_number: '04', capacity: 4, status: 'available' },
                { id: 5, table_number: '05', capacity: 6, status: 'available' },
                { id: 6, table_number: '06', capacity: 8, status: 'available' }
            ]
        };
    }

    const modal = $('#tableModal');
    if(modal) modal.hidden = false;

    if($('#modalHeader')){
        $('#modalHeader').innerHTML = `<span class="eyebrow">SELECT YOUR TABLE</span><h2>${data.name}</h2><p class="meta">Pick a table for your party. Reserved tables are disabled.</p>`;
    }
    const partyCount = getPartyCount();
    if($('#tableGrid')){
        $('#tableGrid').innerHTML = data.tables.map(t => {
            const isUnavailable = t.status !== 'available' || t.capacity < partyCount;
            const statusText = t.capacity < partyCount ? 'Too small' : t.status;
            return `<button class="table-choice ${isUnavailable?'disabled':''}" ${isUnavailable?'disabled':''} onclick="selectTable(${t.id},'${t.table_number}',${t.capacity})"><strong>Table ${t.table_number}</strong><span>Seats ${t.capacity}</span><small>${statusText}</small></button>`;
        }).join('');
    }
    if($('#modalFooter')){
        $('#modalFooter').innerHTML = `<span id="selectedTableText">No table selected</span><button id="reserveSelected" class="btn-primary" disabled onclick="reserveSelectedTable()">Request Reservation →</button>`;
    }
}

function closeTableModal(){
    if($('#tableModal')) $('#tableModal').hidden = true;
    selectedTable = null;
}

function selectTable(id, number, capacity){
    selectedTable = { id, number, capacity };
    document.querySelectorAll('.table-choice').forEach(x => x.classList.remove('selected'));
    if(event && event.currentTarget) event.currentTarget.classList.add('selected');
    if($('#selectedTableText')) $('#selectedTableText').textContent = `Table ${number} selected · ${capacity} seats`;
    if($('#reserveSelected')) $('#reserveSelected').disabled = false;
}

async function reserveSelectedTable(){
    if(!selectedTable || !selectedRestaurant) return;
    const r = restaurants.find(x => x.id === selectedRestaurant) || MOCK_RESTAURANTS[0];
    const dateVal = getDateVal();
    const timeVal = parseTime($('#time')?.value || '7:00 PM');
    const partyCount = getPartyCount();

    const guestEmail = currentUser ? currentUser.email : 'demo@tablekeeper.local';
    const guestName = currentUser ? currentUser.name : 'Demo Guest';
    const newRes = {
        id: crypto.randomUUID(),
        restaurant_name: r.name,
        table_number: selectedTable.number,
        start_time: `${dateVal}T${timeVal}`,
        guest_count: partyCount,
        guest_name: guestName,
        guest_email: guestEmail,
        status: 'pending'
    };

    try {
        const res = await fetch('/api/reservations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newRes)
        });
        if(res.ok){
            toast('Reservation request submitted! Pending restaurant approval.');
            closeTableModal();
            loadReservations();
            return;
        }
    } catch(e){}

    let resList = JSON.parse(localStorage.getItem('tk_local_res') || '[]');
    resList.unshift(newRes);
    localStorage.setItem('tk_local_res', JSON.stringify(resList));
    toast('Reservation request submitted! Pending restaurant approval.');
    closeTableModal();
    loadReservations();
}

function book(id){
    openTablePicker(id);
}

async function loadReservations(){
    let data = [];
    try {
        const r = await fetch('/api/reservations');
        if(r.ok) data = await r.json();
        else throw new Error();
    } catch(e){
        data = JSON.parse(localStorage.getItem('tk_local_res') || '[]');
    }

    if(!$('#myResList')) return;

    if(!data || data.length === 0){
        $('#myResList').innerHTML = '<p class="meta">No reservations yet. Pick a restaurant above to book a table.</p>';
        return;
    }

    $('#myResList').innerHTML = data.map(x => {
        let badgeClass = 'status-pending';
        let badgeText = 'Pending Approval';
        if(x.status === 'confirmed'){ badgeClass = 'status-confirmed'; badgeText = 'Confirmed'; }
        if(x.status === 'declined'){ badgeClass = 'status-declined'; badgeText = 'Declined'; }
        if(x.status === 'cancelled'){ badgeClass = 'status-cancelled'; badgeText = 'Cancelled'; }

        const canCancel = x.status === 'confirmed' || x.status === 'pending';

        return `<div class="reservation-card">
            <div class="reservation-info">
                <strong>${x.restaurant_name}</strong>
                <small>${new Date(x.start_time || Date.now()).toLocaleString()} · ${x.guest_count} guests · Table ${x.table_number}</small>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <span class="status-pill ${badgeClass}">${badgeText}</span>
                ${canCancel ? `<button class="ghost" style="padding: 4px 8px; font-size: 12px;" onclick="cancelRes('${x.id}')">Cancel</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

async function cancelRes(id){
    try {
        await fetch('/api/reservations/' + id + '/cancel', { method: 'POST' });
    } catch(e){}

    let resList = JSON.parse(localStorage.getItem('tk_local_res') || '[]');
    resList = resList.map(r => r.id === id ? { ...r, status: 'cancelled' } : r);
    localStorage.setItem('tk_local_res', JSON.stringify(resList));

    loadReservations();
    toast('Reservation cancelled');
}

function toast(msg){
    const t = $('#toast');
    if(!t) return;
    t.textContent = msg;
    t.hidden = false;
    t.classList.add('show');
    setTimeout(() => {
        t.classList.remove('show');
        t.hidden = true;
    }, 2800);
}

// Run App
initApp();
