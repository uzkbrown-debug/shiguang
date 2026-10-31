import sys
sys.path.insert(0, '.')
from db import SessionLocal
from models import Friendship, User
from auth import visible_owner_ids

db = SessionLocal()
for f in db.query(Friendship).all():
    print('friend', f.user_id, '->', f.friend_user_id)
me = db.get(User, 'usr_c28e462a0e')
print('visible me:', visible_owner_ids(db, me, 'all'))
print('visible anon:', visible_owner_ids(db, None, 'all'))
for u in db.query(User).all():
    print(u.id, u.nickname)
db.close()
