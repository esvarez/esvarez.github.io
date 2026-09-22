# Board game night — backend

Go Lambdas behind API Gateway, storing interest/attendance in a single
DynamoDB table. This is additive: `../data/games.json` and the frontend's
`localStorage` overrides still work on their own. Nothing here is wired
into the static site yet — see **Wiring up the frontend** below.

## Layout

```
backend/
  template.yaml        SAM template: API Gateway + DynamoDB table + 3 functions
  Makefile              `sam build` invokes this to compile each function
  internal/store/       DynamoDB item mapping, shared by all commands
  cmd/getdata/           Lambda: GET /data
  cmd/putinterest/       Lambda: POST /interest
  cmd/putattendance/     Lambda: POST /attendance
  cmd/seed/              one-off local script to load data/games.json into the table
```

## Data model

Single table, on-demand billing, generic `PK`/`SK` keys:

| PK              | SK                  | attributes         |
|-----------------|---------------------|---------------------|
| `PLAYER#<id>`   | `PROFILE`           | `Name`, `Initial`   |
| `GAME#<id>`     | `PROFILE`           | `Name`, `Min`, `Max`|
| `GAME#<id>`     | `INTEREST#<player>` | `Interested` (bool) |
| `DAY#<id>`      | `PROFILE`           | `Name`              |
| `DAY#<id>`      | `ATTENDEE#<player>` | `Attending` (bool)  |

`GET /data` does a table `Scan` and reassembles this into the same
`{players, games, days}` shape as `data/games.json` — at a dozen games and
six players this is cheaper and simpler than modelling GSIs for it. It
won't stay a good idea if this ever grows to real production scale.

## Deploy

Prerequisites: Go 1.24+, the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html), and AWS credentials for the account you want to deploy into.

```
cd backend
sam build
sam deploy --guided   # first time: pick a stack name and region, accept the prompts
```

`sam deploy` prints an `ApiUrl` and `TableName` output when it finishes.

Load the sample data once, using your own AWS credentials:

```
go run ./cmd/seed -table <TableName from the deploy output>
```

## Try it

```
curl https://<api-id>.execute-api.<region>.amazonaws.com/prod/data

curl -X POST https://<api-id>.execute-api.<region>.amazonaws.com/prod/interest \
  -H 'Content-Type: application/json' \
  -d '{"gameId":"catan","playerId":"farah","interested":true}'
```

## Security — read before sharing the URL

This mirrors the tradeoff from the DynamoDB security question earlier:
the browser never touches AWS credentials — only these Lambdas, through
IAM roles scoped with `DynamoDBReadPolicy` / `DynamoDBWritePolicy` to just
this table, do. But as shipped here:

- **CORS is wide open** (`AllowOrigin: '*'` in `template.yaml`). Anyone
  who has the API URL can call it from any origin. Narrow this to your
  GitHub Pages origin before treating it as more than a link shared with
  friends.
- **There is no authentication on the write endpoints.** Anyone with the
  URL can toggle any player's interest or attendance — there's no
  per-player identity check. Fine for a private group with a shared link,
  not fine if the URL leaks somewhere public. Adding an API key
  (`ApiKeyRequired` + usage plan) or a Cognito authorizer on
  `PutInterestFunction`/`PutAttendanceFunction` closes this if it matters
  for your use case.

## Wiring up the frontend

Not done yet. To switch `assets/app.js` from the static JSON + localStorage
model to this API: replace the `fetch(DATA_URL)` call with the deployed
`ApiUrl + "data"`, and change `toggleInterest`/`toggleAttendee` to `POST`
to `/interest` and `/attendance` instead of writing to `localStorage`
(optionally keeping localStorage as an optimistic-update cache). That's a
separate change from this one — ask if you want it done too.
