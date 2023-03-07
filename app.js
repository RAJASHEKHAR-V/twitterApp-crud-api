// importing express js core path

const express = require("express");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();

app.use(express.json());

// importing sqlite, sqlite3, bcrypt, jsonwebtoken

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Initialize the database and server

let db = null;

const initializeDatabaseAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`Db Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDatabaseAndServer();

//API-1 user register

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const addUserQuery = `
    INSERT INTO user(name, username, password, gender)
    VALUES('${name}',
     '${username}', '${hashedPassword}','${gender}');`;

  const isUserPresentQuery = `
     SELECT * FROM user WHERE username = '${username}';`;

  const isUserPresent = await db.get(isUserPresentQuery);
  if (isUserPresent !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const dbResponse = await db.run(addUserQuery);
    response.status(200);
    response.send("User created successfully");
  }
});

// Authentication check for each operation

const AuthenticateToken = async (request, response, next) => {
  const headersCheck = request.headers["authorization"];
  let jwtToken;
  if (headersCheck !== undefined) {
    jwtToken = headersCheck.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    await jwt.verify(jwtToken, "ak2284ns8Di32", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        next();
      }
    });
  }
};

//API login credentials

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserQuery = `SELECT * FROM user WHERE username ='${username}';`;
  const isUserPresent = await db.get(checkUserQuery);
  const payload = isUserPresent;
  if (isUserPresent === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      isUserPresent.password
    );
    if (isPasswordMatched) {
      const jwtToken = await jwt.sign(payload, "ak2284ns8Di32");
      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API-3 the latest tweets of people whom the user follows(joeBiden). Return 4 tweets at a time

app.get("/user/tweets/feed/", AuthenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, username, gender } = payload;
  const latestTweetsQuery = `
  SELECT user.username AS username,tweet.tweet AS tweet, tweet.date_time AS dateTime
  FROM user INNER JOIN follower ON follower.following_user_id=user.user_id
  INNER JOIN tweet ON tweet.user_id=follower.following_user_id
  WHERE follower.follower_user_id =${user_id}
  ORDER BY dateTime DESC LIMIT 4;`;
  const latestTweet = await db.all(latestTweetsQuery);
  response.send(latestTweet);
});

//API-4 the list of all names of people whom the user follows

app.get("/user/following/", AuthenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, username, gender } = payload;
  const getFollowingNameQuery = `
    SELECT DISTINCT user.username AS username
    FROM user INNER JOIN follower ON follower.following_user_id=user.user_id
    WHERE follower.follower_user_id = ${user_id};`;
  const allFollowingUserNames = await db.all(getFollowingNameQuery);
  response.send(allFollowingUserNames);
});

//API-5 the list of all names of people who follows the user

app.get("/user/followers/", AuthenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, username, gender } = payload;
  const getFollowerNamesQuery = `
    SELECT DISTINCT user.username AS username
    FROM user INNER JOIN follower ON follower.follower_user_id=user.user_id
    WHERE follower.following_user_id = ${user_id}`;
  const followerNames = await db.all(getFollowerNamesQuery);
  response.send(followerNames);
});

//API-6 the user requests a tweet of the user he is following, return the tweet, likes count, replies count and date-time

app.get("/tweets/:tweetId/", AuthenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, username, gender } = payload;
  const { tweetId } = request.params;
  const checkTweetIdOfFollowingUserQuery = `
    SELECT * FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id
    WHERE follower.follower_user_id =${user_id} AND tweet_id = ${tweetId};`;
  const isTweetIdPresent = await db.get(checkTweetIdOfFollowingUserQuery);
  if (isTweetIdPresent === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetReplayLikesDetailsQuery = `
      SELECT tweet.tweet AS tweet, COUNT(like.like_id) AS likes, COUNT(reply.reply_id) AS replies, tweet.date_time AS dateTime
      FROM follower INNER JOIN tweet ON tweet.user_id =follower.following_user_id
      INNER JOIN reply ON reply.tweet_id = tweet.tweet_id INNER JOIN like ON
      like.tweet_id = reply.tweet_id
      WHERE follower.follower_user_id =${user_id} AND tweet.tweet_id = ${tweetId};`;
    const tweetReplayLikesDetailsQuery = await db.get(
      getTweetReplayLikesDetailsQuery
    );
    response.send(tweetReplayLikesDetailsQuery);
  }
});

//API-7 If the user requests a tweet of a user he is following, return the list of usernames who liked the tweet

//converting the the given result into as expected output i.e array of names inside object.
const convert_The_list_of_names_As_Likes_inside_object = (likeUserNames) => {
  let resultArray = [];
  for (let eachObject of likeUserNames) {
    resultArray.push(eachObject.username);
  }
  return { likes: resultArray };
};

app.get(
  "/tweets/:tweetId/likes/",
  AuthenticateToken,
  async (request, response) => {
    const { payload } = request;
    const { user_id, username, gender } = payload;
    const { tweetId } = request.params;
    const checkTweetIdOfFollowingUserQuery = `
    SELECT * FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id
    WHERE follower.follower_user_id =${user_id} AND tweet_id = ${tweetId};`;
    const isTweetIdPresent = await db.get(checkTweetIdOfFollowingUserQuery);
    if (isTweetIdPresent === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikesUserNameQuery = `
      SELECT user.username AS username FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id
      INNER JOIN like ON like.tweet_id=tweet.tweet_id INNER JOIN user ON
      user.user_id=like.user_id
      WHERE follower.follower_user_id =${user_id} AND tweet.tweet_id=${tweetId};`;
      const likeUserNames = await db.all(getLikesUserNameQuery);
      const resultObject = convert_The_list_of_names_As_Likes_inside_object(
        likeUserNames
      );
      response.send(resultObject);
    }
  }
);

//API-8  the user requests a tweet of a user he is following, return the list of replies.

app.get(
  "/tweets/:tweetId/replies/",
  AuthenticateToken,
  async (request, response) => {
    const { payload } = request;
    const { user_id, username, gender } = payload;
    const { tweetId } = request.params;
    const checkTweetIdOfFollowingUserQuery = `
    SELECT * FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id
    WHERE follower.follower_user_id =${user_id} AND tweet_id = ${tweetId};`;
    const isTweetIdPresent = await db.get(checkTweetIdOfFollowingUserQuery);
    if (isTweetIdPresent === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getReplyUserNames = `
        SELECT user.username AS username
        FROM follower INNER JOIN tweet ON tweet.user_id=follower.following_user_id
        INNER JOIN reply ON reply.tweet_id=tweet.tweet_id INNER JOIN user ON
        user.user_id=reply.user_id
        WHERE follower.follower_user_id=${user_id} AND tweet.tweet_id=${tweetId};`;
      const replyUserNames = await db.all(getReplyUserNames);
      response.send({ replies: replyUserNames });
    }
  }
);

//API-9 a list of all tweets of the user
