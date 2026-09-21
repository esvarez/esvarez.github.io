// Command putattendance is the Lambda behind POST /attendance. It records
// whether one player is attending one day, mirroring the toggle done
// client-side in assets/app.js (toggleAttendee).
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

type attendanceRequest struct {
	DayID     string `json:"dayId"`
	PlayerID  string `json:"playerId"`
	Attending bool   `json:"attending"`
}

func init() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatalf("load aws config: %v", err)
	}
	st = store.New(dynamodb.NewFromConfig(cfg), os.Getenv("TABLE_NAME"))
}

func handler(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	var body attendanceRequest
	if err := json.Unmarshal([]byte(req.Body), &body); err != nil {
		return store.ErrorResponse(400, "invalid JSON body"), nil
	}
	if body.DayID == "" || body.PlayerID == "" {
		return store.ErrorResponse(400, "dayId and playerId are required"), nil
	}

	if err := st.PutAttendance(ctx, body.DayID, body.PlayerID, body.Attending); err != nil {
		log.Printf("put attendance: %v", err)
		return store.ErrorResponse(500, "internal error"), nil
	}

	return events.APIGatewayProxyResponse{StatusCode: 204, Headers: store.CORSHeaders()}, nil
}

func main() {
	lambda.Start(handler)
}
