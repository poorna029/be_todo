const express = require("express");
const app = express();
app.use(express.json());
const cors = require("cors");
app.use(cors());
let db = null;
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "userData.db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const PORT = process.env.PORT || 3000;

const initializeDBandServer = async () => {
  try {
    app.listen(PORT, () => {
      console.log(`server running at http://localhost:${PORT}`);
    });
    db = await open({ filename: dbPath, driver: sqlite3.Database });
  } catch (e) {
    console.log(`DBerror ${e.Message}`);
    process.exit(1);
  }
};

initializeDBandServer();

// registering user details:

app.post("/register", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  console.log(request.body);
  const create_table_qry = `CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    gender TEXT,location TEXT

);`;
  await db.run(create_table_qry);
  const Check_User_Qry = `select * from users where username="${username}";`;
  const Check_User = await db.get(Check_User_Qry);
  console.log({ Check_User });
  const len_of_password = password.length;
  const hashedpassword = await bcrypt.hash(password, 15);
  if (Check_User === undefined) {
    // user not registered yet:
    if (len_of_password < 5) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const Register_Qry = `insert into users
            (name,username,password,gender,location
            ) values("${name}","${username}",
            "${hashedpassword}","${gender}","${location}");`;
      await db.run(Register_Qry);
      response.send("User created successfully");
    }
  } else {
    // user registered
    response.status(400);
    response.send("User already exists");
  }
});

// login api:

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  console.log(username, password);
  const Check_User_Qry = `select * from users where username="${username}";`;

  const Check_User = await db.get(Check_User_Qry);
  console.log(Check_User);

  if (Check_User === undefined) {
    // not registered trying to login:
    response.status(400);
    response.send("Invalid user");
  } else {
    // registered credentials needed to prove:
    // password matches
    const oldpassword = Check_User.password;
    const is_pw_match = await bcrypt.compare(password, oldpassword);
    if (is_pw_match === true) {
      //   response.send(200);
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "lkjhgfdsa");
      response.send({ jwtToken });
    }
    // password mismatch
    else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// api for password_change:
app.put("/change-password", authenticateFn, async (request, response) => {
  const { username, oldPassword, newPassword } = request.body;
  console.log(username, oldPassword, newPassword);
  const username_is_valid_Qry = `select * from users
    where username="${username}";`;
  const user_name_details = await db.get(username_is_valid_Qry);
  const old_password_db = user_name_details.password;
  const is_pw_matches = await bcrypt.compare(oldPassword, old_password_db);
  const len_new_pw = newPassword.length;
  if (is_pw_matches) {
    if (len_new_pw < 5) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashed_new_pw = await bcrypt.hash(newPassword, 15);
      const update_pw_qry = `update users set password="${hashed_new_pw}"
            where username="${username}";`;
      await db.run(update_pw_qry);
      response.send("Password updated");
    }
  } else {
    // password mismatch
    response.status(400);
    response.send("Invalid current password");
  }
});

function authenticateFn(request, response, next) {
  const auth_input = request.headers["authorization"];
  console.log(auth_input);

  if (auth_input === undefined) {
    //   possibility1 : token not provided
    response.status(400);
    response.send("Invalid JWT Token");
  } else {
    // possibility2  : token is invalid
    //   possibility3 : correct token
    let jwtToken = auth_input.split(" ")[1];
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      const payload = jwt.verify(jwtToken, "lkjhgfdsa", (error, user) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = user.username;
          next();
        }
      });
    }
  }
}

// api for add todo
app.post("/add_todo", authenticateFn, async (request, response) => {
  const { todo, status } = request.body;
  const username = request.username;
  console.log(todo, status);

  const create_table_qry = `CREATE TABLE IF NOT EXISTS todos(
      todo_id INTEGER PRIMARY KEY,
      todo TEXT NOT NULL,
      status TEXT NOT NULL,
      username TEXT NOT NULL,
      FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
  );`;
  await db.run(create_table_qry);

  const get_qry = `select * from todos where todo="${todo}" and username="${username}";`;
  const is_exists = await db.all(get_qry);
  console.log(is_exists);

  const create_add_todo_qry = `insert into todos(todo,status,username) values("${todo}","${status}","${username}");`;
  if (!is_exists.length) {
    const res = await db.run(create_add_todo_qry);
    response.send(`created successfully with todo_id ${res.lastID}`);
  } else {
    response.status(400);
    response.send("todo already exists");
  }
});

// api for delete todo

app.delete("/delete_todo", authenticateFn, async (request, response) => {
  const { todo_id } = request.body;
  const username = request.username;
  console.log(todo_id);
  const get_qry = `select * from todos where todo_id=${todo_id} and username="${username}";`;

  const delete_todo_qry = `delete from todos where todo_id=${todo_id} and username="${username}";`;
  const is_exists = await db.get(get_qry);
  if (is_exists) {
    const res = await db.run(delete_todo_qry);
    response.send(
      `${is_exists.todo} is deleted sussessfully with todo_id ${todo_id} `
    );
  } else {
    response.send(`no todo with associated todo_id - ${todo_id}`);
  }
});

app.get("/show_todos", authenticateFn, async (request, response) => {
  const username = request.username;
  const get_qry = `select * from todos where username="${username}";`;
  const todos = await db.all(get_qry);
  if (todos) {
    response.send(todos);
  } else {
    response.send("no records found");
  }
});

app.put("/edit_todo", authenticateFn, async (request, response) => {
  const { todo, todo_id } = request.body;
  const get_qry = `select * from todos where todo_id=${todo_id};`;
  const todo_exixts = await db.get(get_qry);
  if (todo_exixts) {
    const edit_qry = `update todos set todo = "${todo}" where todo_id=${todo_id};`;
    const res = await db.run(edit_qry);
    response.send(`updated todo from ${todo_exixts.todo} to ${todo}`);
  } else {
    response.send("todo not found");
  }
});
