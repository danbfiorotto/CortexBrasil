import requests
import jwt
import datetime

SECRET_KEY = "generate_a_strong_random_secret"
ALGORITHM = "HS256"

def create_token(user_phone):
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=15)
    to_encode = {"sub": user_phone, "exp": expire}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def test_endpoints():
    token = create_token("5511999999999")
    headers = {"Authorization": f"Bearer {token}"}
    
    print(f"Testing with Token: {token[:10]}...")
    
    # 1. Test Summary
    print("\n--- Testing /api/dashboard/summary ---")
    try:
        resp = requests.get("http://localhost:8000/api/dashboard/summary", headers=headers)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

    # 2. Test HUD
    print("\n--- Testing /api/dashboard/hud ---")
    try:
        resp = requests.get("http://localhost:8000/api/dashboard/hud", headers=headers)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_endpoints()
