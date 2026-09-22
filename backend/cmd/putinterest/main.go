// Command putinterest is the Lambda behind POST /interest. It records
// whether one player is interested in one game, mirroring the toggle done
// client-side in assets/app.js (toggleInterest).
package main

import (
	"context"
	"encoding/json"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"boardgamenight/backend/internal/store"
)

var st *store.Store

type interestRequest struct {
	GameID     string `json:"gameId"`
	PlayerID   string `json:"playerId"`
	Interested bool   `json:"interested"`
}

func init() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatalf("load aws config: %v", err)
	}
	st = store.New(dynamodb.NewFromConfig(cfg), os.Getenv("TABLE_NAME"))
}

func handler(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	var body interestRequest
	if err := json.Unmarshal([]byte(req.Body), &body); err != nil {
		return store.ErrorResponse(400, "invalid JSON body"), nil
	}
	if body.GameID == "" || body.PlayerID == "" {
		return store.ErrorResponse(400, "gameId and playerId are required"), nil
	}

	if err := st.PutInterest(ctx, body.GameID, body.PlayerID, body.Interested); err != nil {
		log.Printf("put interest: %v", err)
		return store.ErrorResponse(500, "internal error"), nil
	}

	return events.APIGatewayProxyResponse{StatusCode: 204, Headers: store.CORSHeaders()}, nil
}

func main() {
	lambda.Start(handler)
}
