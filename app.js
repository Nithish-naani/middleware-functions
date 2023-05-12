const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

app.use(express.json());

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("This Server is Running in http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB ERROR-${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const convertDbObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

function authenticateToken(request, response, next) {
  let jwtToken;
  let authHeader = request.header["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const query = `SELECT * FROM user WHERE username='${username}';`;
  const name = await db.get(query);
  if (name === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, name.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authenticateToken, async (request, response) => {
  const query = `SELECT * FROM state;`;
  const statesArray = await db.all(query);
  response.send(
    statesArray.map((eachState) => {
      convertDbObjectToResponseObject(eachState);
    })
  );
});

app.get("/states/:stateId", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const query = `SELECT * FROM state WHERE state_id = ${stateId};`;
  const value = await db.get(query);
  response.send(convertDbObjectToResponseObject(value));
});

app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const query = `INSERT INTO district(district_name, state_id, cases, cured, active, deaths)
                   VALUES(${districtName}, '${stateId}', ${cases}, ${cured}, ${active}, ${deaths});`;
  const value = await db.run(query);
  response.send("District Successfully Added");
});

app.get(
  "districts/:districtId",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const query = `SELECT * FROM district WHERE district_id = ${districtId};`;
    const value = await db.get(query);
    response.send(convertDbObjectToResponseObject(value));
  }
);

app.delete(
  "/districts/:districtId",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const query = `DELETE FROM district WHERE district_id = ${districtId};`;
    const value = await db.run(query);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const query = `UPDATE district SET
                   district_name='${districtName}',
                   state_id = '${stateId}',
                   cases = '${cases}',
                   cured = '${cured}',
                   active = '${active}',
                   deaths = '${deaths}'
                   WHERE district_id = ${districtId};`;
    const value = await db.run(query);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const query = `SELECT SUM(cases),
                  SUM (cured), SUM(active),
                  SUM(deaths)
                   FROM district WHERE 
                   state_id=${stateId};`;
    const stats = await db.get(query);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;
