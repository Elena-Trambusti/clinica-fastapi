"""
Configurazione test: variabili d'ambiente prima dell'import dell'applicazione.
"""

import os

# Deve avvenire prima di `import app.*` (SECRET_KEY, database)
os.environ.setdefault("SECRET_KEY", "test-secret-key-exactly-32chars!!")
os.environ.setdefault("SQLALCHEMY_DATABASE_URL", "sqlite:///./test_clinica.db")
os.environ.setdefault("ALLOWED_ORIGINS", "http://testserver")
