from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# 1.Dico dove salvare il database
SQLALCHEMY_DATABASE_URL="sqlite:///./clinica.db"

# 2.Creo il motore che parla con il database
engine=create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread":False})

# 3.Creo la fabbrica di sessioni
SessionLocal=sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4.La base
Base=declarative_base()