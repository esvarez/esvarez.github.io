package store

// Player, Game and Day mirror the shape of the frontend's data/games.json
// so the GetData Lambda can be swapped in for the static file with no
// changes on the client.

type Player struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Initial string `json:"initial"`
}

type Game struct {
	ID       string          `json:"id"`
	Name     string          `json:"name"`
	Min      int             `json:"min"`
	Max      int             `json:"max"`
	Interest map[string]bool `json:"interest"`
}

type Day struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Attendees []string `json:"attendees"`
}

type Snapshot struct {
	Players []Player `json:"players"`
	Games   []Game   `json:"games"`
	Days    []Day    `json:"days"`
}
