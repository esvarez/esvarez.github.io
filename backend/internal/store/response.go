package store

import (
	"encoding/json"

	"github.com/aws/aws-lambda-go/events"
)

// CORSHeaders lets the static GitHub Pages frontend (a different origin)
// call this API directly. API Gateway also adds its own CORS headers from
// the SAM template's Cors config; both must agree.
func CORSHeaders() map[string]string {
	return map[string]string{
		"Access-Control-Allow-Origin": "*",
	}
}

func JSONResponse(status int, body interface{}) events.APIGatewayProxyResponse {
	headers := CORSHeaders()
	headers["Content-Type"] = "application/json"

	payload, err := json.Marshal(body)
	if err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: 500,
			Headers:    headers,
			Body:       `{"error":"failed to encode response"}`,
		}
	}

	return events.APIGatewayProxyResponse{
		StatusCode: status,
		Headers:    headers,
		Body:       string(payload),
	}
}

func ErrorResponse(status int, message string) events.APIGatewayProxyResponse {
	return JSONResponse(status, map[string]string{"error": message})
}
