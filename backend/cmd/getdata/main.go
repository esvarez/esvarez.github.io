// Command getdata is the Lambda behind GET /data. It returns the full
// players/games/days snapshot in the same shape as the frontend's static
// data/games.json, so the client's rendering code does not need to change.
package main

import (
	"context"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"boardgamenight/backend/internal/store"
)

var st *store.Store

func init() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatalf("load aws config: %v", err)
	}
	st = store.New(dynamodb.NewFromConfig(cfg), os.Getenv("TABLE_NAME"))
}

func handler(ctx context.Context, _ events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	snapshot, err := st.GetSnapshot(ctx)
	if err != nil {
		log.Printf("get snapshot: %v", err)
		return store.ErrorResponse(500, "internal error"), nil
	}
	return store.JSONResponse(200, snapshot), nil
}

func main() {
	lambda.Start(handler)
}
