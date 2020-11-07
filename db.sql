CREATE TABLE players (
	id serial PRIMARY KEY,
	username VARCHAR (50) UNIQUE NOT NULL,
	money INTEGER NOT NULL,
	hashedpw VARCHAR (60) NOT NULL
);
