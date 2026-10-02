from flask import Flask, jsonify, request, render_template, g, session
import sqlite3, os, uuid, threading, urllib.request, json
from datetime import datetime, timedelta
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

BASE=os.path.dirname(__file__)
DB=os.path.join(BASE,'tablekeeper.db')
app=Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'tablekeeper-secret-key-2026')
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')

SCHEMA='''
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS restaurants(id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, address TEXT, timezone TEXT NOT NULL, cuisine TEXT, price_range TEXT, rating REAL, image TEXT, hours TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, phone TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS owners(id INTEGER PRIMARY KEY, restaurant_id INTEGER NOT NULL, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(restaurant_id) REFERENCES restaurants(id));
CREATE TABLE IF NOT EXISTS tables(id INTEGER PRIMARY KEY, restaurant_id INTEGER NOT NULL, table_number TEXT NOT NULL, capacity INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'available', FOREIGN KEY(restaurant_id) REFERENCES restaurants(id));
CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY, restaurant_id INTEGER NOT NULL, table_id INTEGER NOT NULL, user_id INTEGER NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, guest_count INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', idempotency_key TEXT UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(restaurant_id) REFERENCES restaurants(id), FOREIGN KEY(table_id) REFERENCES tables(id));
'''

def db():
    if 'db' not in g:
        g.db=sqlite3.connect(DB, timeout=10, isolation_level=None)
        g.db.row_factory=sqlite3.Row
        g.db.execute('PRAGMA foreign_keys=ON')
    return g.db

@app.teardown_appcontext
def close(_):
    c=g.pop('db',None)
    if c: c.close()

def init():
    con=sqlite3.connect(DB, isolation_level=None)
    con.executescript(SCHEMA)
    count=con.execute('select count(*) from restaurants').fetchone()[0]
    if not count:
        now=datetime.utcnow().isoformat()
        restaurants=[
          ('The Olive Garden','Handmade pasta, candlelight and a warm Italian table.','Downtown · 18 Market Street','America/New_York','Italian','$$$',4.7,'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=85','11:30 AM – 10:30 PM'),
          ('Juniper & Co.','Seasonal plates, bright herbs and modern American comfort.','Riverside · 7 Willow Lane','America/Chicago','American','$$',4.8,'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=85','5:00 PM – 11:00 PM'),
          ('Saffron House','North Indian classics with a contemporary tasting-menu twist.','Arts District · 42 Lotus Ave','Asia/Kolkata','Indian','$$',4.6,'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1200&q=85','12:00 PM – 10:00 PM'),
          ('Kumo','Intimate Japanese dining, omakase and robata.','Midtown · 91 Pine Street','Asia/Tokyo','Japanese','$$$$',4.9,'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=85','6:00 PM – 11:00 PM'),
          ('Casa Verde','Vibrant coastal Mexican food, agave cocktails and tacos.','Old Town · 12 Verde Plaza','America/Los_Angeles','Mexican','$$',4.5,'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=1200&q=85','11:00 AM – 11:00 PM')]
        for r in restaurants: con.execute('insert into restaurants(name,description,address,timezone,cuisine,price_range,rating,image,hours,created_at) values(?,?,?,?,?,?,?,?,?,?)',(*r,now))
        uid=con.execute('insert into users(name,email,phone,created_at) values(?,?,?,?)',('Demo Guest','demo@tablekeeper.local','+1 555 0100',now)).lastrowid
        
        for rid in range(1,6):
            for n,cap in [('01',2),('02',2),('03',4),('04',4),('05',6),('06',8),('07',2),('08',4)]:
                con.execute('insert into tables(restaurant_id,table_number,capacity,status) values(?,?,?,?)',(rid,n,cap,'available'))
        
        start='2026-09-28T19:00:00-04:00'; end='2026-09-28T20:30:00-04:00'
        con.execute('insert into reservations values(?,?,?,?,?,?,?,?,?,?,?)',(str(uuid.uuid4()),1,3,uid,start,end,4,'confirmed','seed-demo-1',now,now))
        start2='2026-09-28T20:00:00-04:00'; end2='2026-09-28T21:00:00-04:00'
        con.execute('insert into reservations values(?,?,?,?,?,?,?,?,?,?,?)',(str(uuid.uuid4()),1,1,uid,start2,end2,2,'pending','seed-demo-2',now,now))

    owner_count = con.execute('select count(*) from owners').fetchone()[0]
    if not owner_count:
        now=datetime.utcnow().isoformat()
        owners = [
            (1, 'Marco Rossi', 'olive@tablekeeper.local', 'owner123'),
            (2, 'Sarah Jenkins', 'juniper@tablekeeper.local', 'owner123'),
            (3, 'Rajesh Kumar', 'saffron@tablekeeper.local', 'owner123'),
            (4, 'Kenji Sato', 'kumo@tablekeeper.local', 'owner123'),
            (5, 'Elena Gomez', 'casa@tablekeeper.local', 'owner123')
        ]
        for rid, name, email, pwd in owners:
            con.execute('insert into owners(restaurant_id,name,email,password,created_at) values(?,?,?,?,?)',
                        (rid, name, email, pwd, now))

    con.close()

@app.get('/')
def home(): return render_template('index.html')

@app.get('/api/auth/config')
def auth_config():
    return jsonify(google_client_id=GOOGLE_CLIENT_ID)

@app.post('/api/auth/google')
def google_auth():
    data = request.get_json(silent=True) or {}
    token = data.get('id_token')
    if not token:
        return jsonify(error='INVALID_INPUT', message='Google ID token is required.'), 400
        
    client_id = data.get('client_id') or GOOGLE_CLIENT_ID
    user_data = None
    
    try:
        id_info = id_token.verify_oauth2_token(token, google_requests.Request(), client_id if client_id else None)
        user_data = {
            'email': id_info.get('email'),
            'name': id_info.get('name', 'Google User'),
            'picture': id_info.get('picture', ''),
            'sub': id_info.get('sub')
        }
    except Exception:
        try:
            url = f"https://oauth2.googleapis.com/tokeninfo?id_token={token}"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req) as resp:
                if resp.status == 200:
                    info = json.loads(resp.read().decode('utf-8'))
                    user_data = {
                        'email': info.get('email'),
                        'name': info.get('name', 'Google User'),
                        'picture': info.get('picture', ''),
                        'sub': info.get('sub')
                    }
        except Exception:
            return jsonify(error='UNAUTHORIZED', message='Invalid or expired Google token.'), 401
            
    if not user_data or not user_data.get('email'):
        return jsonify(error='UNAUTHORIZED', message='Failed to verify Google account email.'), 401

    con = db()
    now = datetime.utcnow().isoformat()
    
    existing = con.execute('select * from users where email=?', (user_data['email'],)).fetchone()
    if not existing:
        uid = con.execute('insert into users(name,email,phone,created_at) values(?,?,?,?)',
                          (user_data['name'], user_data['email'], '', now)).lastrowid
        user_row = con.execute('select * from users where id=?', (uid,)).fetchone()
    else:
        con.execute('update users set name=? where id=?', (user_data['name'], existing['id']))
        user_row = existing
        
    session['user_id'] = user_row['id']
    session['user_email'] = user_row['email']
    session['user_name'] = user_row['name']
    session['user_picture'] = user_data.get('picture', '')
    
    user_dict = dict(user_row)
    user_dict['picture'] = user_data.get('picture', '')
    
    return jsonify(ok=True, user=user_dict)

@app.get('/api/auth/me')
def auth_me():
    uid = session.get('user_id')
    if not uid:
        return jsonify(authenticated=False), 200
    user = db().execute('select * from users where id=?', (uid,)).fetchone()
    if not user:
        session.pop('user_id', None)
        return jsonify(authenticated=False), 200
    user_dict = dict(user)
    user_dict['picture'] = session.get('user_picture', '')
    return jsonify(authenticated=True, user=user_dict)

@app.post('/api/auth/logout')
def auth_logout():
    session.clear()
    return jsonify(ok=True)

@app.get('/api/restaurants')
def restaurants():
    q=request.args.get('q','').strip(); cuisine=request.args.get('cuisine','').strip()
    sql='select * from restaurants where 1=1'; args=[]
    if q: sql+=' and (name like ? or cuisine like ? or address like ?)'; args += [f'%{q}%']*3
    if cuisine: sql+=' and cuisine=?'; args.append(cuisine)
    rows=db().execute(sql+' order by rating desc',args).fetchall()
    return jsonify([dict(r) for r in rows])

@app.get('/api/restaurants/<int:rid>')
def restaurant(rid):
    r=db().execute('select * from restaurants where id=?',(rid,)).fetchone()
    if not r: return jsonify(error='NOT_FOUND',message='Restaurant not found.'),404
    data=dict(r)
    tbls=[dict(x) for x in db().execute('select * from tables where restaurant_id=? order by table_number',(rid,)).fetchall()]
    
    date_arg = request.args.get('date')
    time_arg = request.args.get('time')
    tz_offsets = {'America/New_York': '-04:00', 'America/Chicago': '-05:00', 'America/Los_Angeles': '-07:00', 'Asia/Kolkata': '+05:30', 'Asia/Tokyo': '+09:00'}
    offset = tz_offsets.get(data['timezone'], '+00:00')

    if date_arg and time_arg:
        start_iso = f"{date_arg}T{time_arg}{offset}"
        try:
            st = datetime.fromisoformat(start_iso)
            et = st + timedelta(hours=1)
            end_iso = et.isoformat()
            for t in tbls:
                if overlap(t['id'], start_iso, end_iso):
                    t['status'] = 'reserved'
        except Exception:
            pass
    elif date_arg == '2026-09-28' or not date_arg:
        start_iso = f"2026-09-28T19:00:00{offset}"
        end_iso = f"2026-09-28T20:00:00{offset}"
        for t in tbls:
            if overlap(t['id'], start_iso, end_iso):
                t['status'] = 'reserved'

    data['tables'] = tbls
    return jsonify(data)

def overlap(table_id,start,end):
    return db().execute("select id from reservations where table_id=? and status in ('confirmed','pending') and start_time < ? and end_time > ? limit 1",(table_id,end,start)).fetchone()

def overlap_tx(con,table_id,start,end):
    return con.execute("select id from reservations where table_id=? and status in ('confirmed','pending') and start_time < ? and end_time > ? limit 1",(table_id,end,start)).fetchone()

@app.post('/api/reservations')
def create_reservation():
    data=request.get_json(silent=True) or {}
    
    email = session.get('user_email') or data.get('email')
    name = session.get('user_name') or data.get('name')
    data['email'] = email
    data['name'] = name

    required=['restaurant_id','start_time','end_time','guest_count','name','email']
    if any(not data.get(k) for k in required): return jsonify(error='INVALID_INPUT',message='Please check the reservation details or sign in.'),400
    idem=request.headers.get('Idempotency-Key') or data.get('idempotency_key')
    if not idem: return jsonify(error='INVALID_INPUT',message='An idempotency key is required.'),400
    con=db()
    try:
        con.execute('BEGIN IMMEDIATE')
        existing=con.execute('select * from reservations where idempotency_key=?',(idem,)).fetchone()
        if existing:
            con.execute('COMMIT'); return jsonify(reservation=dict(existing),replayed=True),200
        r=con.execute('select * from restaurants where id=?',(data['restaurant_id'],)).fetchone()
        if not r: raise ValueError('restaurant')
        try:
            start=datetime.fromisoformat(data['start_time']); end=datetime.fromisoformat(data['end_time'])
            if start.tzinfo is None or end.tzinfo is None or end<=start: raise ValueError()
        except Exception: con.execute('ROLLBACK'); return jsonify(error='INVALID_RESERVATION',message='The requested reservation time is invalid.'),400
        guest=int(data['guest_count'])
        requested_table=data.get('table_id')
        if requested_table is not None:
            table=con.execute("select * from tables where id=? and restaurant_id=? and capacity>=? and status='available'",(int(requested_table),r['id'],guest)).fetchall()
        else:
            table=con.execute("select * from tables where restaurant_id=? and capacity>=? and status='available' order by capacity, id",(r['id'],guest)).fetchall()
        chosen=None
        for t in table:
            if not overlap_tx(con,t['id'],start.isoformat(),end.isoformat()): chosen=t; break
        if not chosen:
            con.execute('ROLLBACK'); return jsonify(error='TABLE_UNAVAILABLE',message='This table is no longer available.'),409
        now=datetime.utcnow().isoformat(); uid=con.execute('select id from users where email=?',(data['email'],)).fetchone()
        if not uid:
            uid=con.execute('insert into users(name,email,phone,created_at) values(?,?,?,?)',(data['name'],data['email'],data.get('phone'),now)).lastrowid
        else: uid=uid['id']
        rid=str(uuid.uuid4())
        
        initial_status = data.get('status', 'pending')
        con.execute('insert into reservations values(?,?,?,?,?,?,?,?,?,?,?)',(rid,r['id'],chosen['id'],uid,start.isoformat(),end.isoformat(),guest,initial_status,idem,now,now))
        con.execute('COMMIT')
        return jsonify(reservation=dict(con.execute('select * from reservations where id=?',(rid,)).fetchone()),replayed=False),201
    except ValueError:
        try: con.execute('ROLLBACK')
        except: pass
        return jsonify(error='INVALID_INPUT',message='Please check the reservation details.'),400
    except sqlite3.IntegrityError:
        try: con.execute('ROLLBACK')
        except: pass
        return jsonify(error='CONFLICT',message='The reservation could not be committed.'),409

@app.get('/api/reservations')
def reservations():
    user_email = session.get('user_email')
    if user_email:
        rows=db().execute('select r.*, t.table_number, x.name restaurant_name from reservations r join tables t on t.id=r.table_id join restaurants x on x.id=r.restaurant_id join users u on u.id=r.user_id where u.email=? order by start_time desc', (user_email,)).fetchall()
    else:
        rows=db().execute('select r.*, t.table_number, x.name restaurant_name from reservations r join tables t on t.id=r.table_id join restaurants x on x.id=r.restaurant_id order by start_time desc').fetchall()
    return jsonify([dict(r) for r in rows])

@app.post('/api/reservations/<rid>/cancel')
def cancel(rid):
    cur=db().execute("update reservations set status='cancelled', updated_at=? where id=? and status in ('confirmed', 'pending')",(datetime.utcnow().isoformat(),rid))
    if not cur.rowcount: return jsonify(error='NOT_FOUND',message='Reservation not found or already cancelled/processed.'),404
    return jsonify(ok=True)

# --- RESTAURANT OWNER PORTAL ENDPOINTS ---

@app.post('/api/owner/login')
def owner_login():
    data = request.get_json(silent=True) or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()
    
    if not email or not password:
        return jsonify(error='INVALID_INPUT', message='Email and password are required.'), 400
        
    owner = db().execute('select o.*, r.name restaurant_name, r.cuisine from owners o join restaurants r on r.id=o.restaurant_id where lower(o.email)=?', (email,)).fetchone()
    if not owner or owner['password'] != password:
        return jsonify(error='UNAUTHORIZED', message='Invalid email or password.'), 401
        
    session['owner_id'] = owner['id']
    session['restaurant_id'] = owner['restaurant_id']
    
    owner_dict = dict(owner)
    del owner_dict['password']
    return jsonify(ok=True, owner=owner_dict)

@app.get('/api/owner/me')
def owner_me():
    oid = session.get('owner_id')
    if not oid:
        return jsonify(authenticated=False), 200
    owner = db().execute('select o.*, r.name restaurant_name, r.cuisine from owners o join restaurants r on r.id=o.restaurant_id where o.id=?', (oid,)).fetchone()
    if not owner:
        session.clear()
        return jsonify(authenticated=False), 200
    owner_dict = dict(owner)
    del owner_dict['password']
    return jsonify(authenticated=True, owner=owner_dict)

@app.post('/api/owner/logout')
def owner_logout():
    session.clear()
    return jsonify(ok=True)

@app.get('/api/owner/reservations')
def owner_reservations():
    oid = session.get('owner_id')
    rid = session.get('restaurant_id')
    if not oid or not rid:
        return jsonify(error='UNAUTHORIZED', message='Owner authentication required.'), 401
        
    status = request.args.get('status', '').strip()
    sql = '''
    select r.*, t.table_number, t.capacity table_capacity, u.name guest_name, u.email guest_email, u.phone guest_phone
    from reservations r
    join tables t on t.id = r.table_id
    join users u on u.id = r.user_id
    where r.restaurant_id = ?
    '''
    args = [rid]
    if status:
        sql += ' and r.status = ?'
        args.append(status)
    sql += ' order by r.created_at desc'
    
    rows = db().execute(sql, args).fetchall()
    return jsonify([dict(r) for r in rows])

@app.post('/api/owner/reservations/<rid>/accept')
def owner_accept_reservation(rid):
    oid = session.get('owner_id')
    rest_id = session.get('restaurant_id')
    if not oid or not rest_id:
        return jsonify(error='UNAUTHORIZED', message='Owner authentication required.'), 401
        
    cur = db().execute("update reservations set status='confirmed', updated_at=? where id=? and restaurant_id=? and status='pending'",
                       (datetime.utcnow().isoformat(), rid, rest_id))
    if not cur.rowcount:
        return jsonify(error='NOT_FOUND', message='Pending reservation not found or already processed.'), 404
        
    return jsonify(ok=True, message='Reservation confirmed!')

@app.post('/api/owner/reservations/<rid>/decline')
def owner_decline_reservation(rid):
    oid = session.get('owner_id')
    rest_id = session.get('restaurant_id')
    if not oid or not rest_id:
        return jsonify(error='UNAUTHORIZED', message='Owner authentication required.'), 401
        
    cur = db().execute("update reservations set status='declined', updated_at=? where id=? and restaurant_id=? and status in ('pending', 'confirmed')",
                       (datetime.utcnow().isoformat(), rid, rest_id))
    if not cur.rowcount:
        return jsonify(error='NOT_FOUND', message='Reservation not found or already processed.'), 404
        
    return jsonify(ok=True, message='Reservation declined.')

@app.post('/api/concurrency-test')
def concurrency_test():
    data=request.get_json(silent=True) or {}
    count=max(2,min(int(data.get('requests',10)),50))
    rid=int(data.get('restaurant_id',1))
    
    con=db()
    target_table = con.execute("select id from tables where restaurant_id=? order by id limit 1", (rid,)).fetchone()
    tid = target_table['id'] if target_table else 1
    
    start='2026-09-28T21:00:00-04:00'
    end='2026-09-28T22:00:00-04:00'
    
    con.execute("delete from reservations where table_id=? and start_time=? and user_id in (select id from users where email like 'lab%@tablekeeper.local')", (tid, start))
    
    results=[]
    lock=threading.Lock()
    def attempt(i):
        with app.test_client() as c:
            res=c.post('/api/reservations',json={
                'restaurant_id':rid,
                'table_id':tid,
                'start_time':start,
                'end_time':end,
                'guest_count':2,
                'name':f'Lab {i}',
                'email':f'lab{i}@tablekeeper.local',
                'status': 'confirmed'
            },headers={'Idempotency-Key':f'lab-{uuid.uuid4()}'})
            with lock: results.append(res.status_code)
            
    threads=[threading.Thread(target=attempt,args=(i,)) for i in range(count)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    
    return jsonify(
        requests=count,
        successful=results.count(201),
        rejected=sum(x==409 for x in results),
        double_booking_prevented=results.count(201)==1,
        raw_statuses=results
    )

@app.post('/api/idempotency-test')
def idempotency_test():
    con=db()
    key='lab-idem-'+str(uuid.uuid4())
    payload={'restaurant_id':2,'start_time':'2026-09-28T19:00:00-05:00','end_time':'2026-09-28T20:00:00-05:00','guest_count':2,'name':'Idempotency Lab','email':'idem@tablekeeper.local','status':'confirmed'}
    
    con.execute("delete from reservations where user_id in (select id from users where email='idem@tablekeeper.local')")
    
    statuses=[]
    ids=[]
    for _ in range(5):
        with app.test_client() as c:
            r=c.post('/api/reservations',json=payload,headers={'Idempotency-Key':key})
            statuses.append(r.status_code)
            res_data = r.get_json() or {}
            res_obj = res_data.get('reservation') or {}
            if res_obj.get('id'):
                ids.append(res_obj['id'])
                
    unique_ids = len(set(ids))
    return jsonify(
        requests=5,
        reservations_created=unique_ids,
        duplicate_reservations=0 if unique_ids==1 else unique_ids-1,
        statuses=statuses
    )

if __name__=='__main__':
    init()
    app.run(host='0.0.0.0',port=int(os.getenv('PORT',5000)),debug=True)
