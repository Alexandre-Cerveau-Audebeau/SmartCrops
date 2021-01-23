"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var React = require("react");
var SimplePlant_1 = require("../components/plants/SimplePlant");
var reactstrap_1 = require("reactstrap");
var plants = [
    { name: 'pedro', age: 28 },
    { name: 'odbeau', age: 24 },
];
function Plants() {
    return (React.createElement("div", null,
        React.createElement("h1", null, "J'ai r\u00E9ussi"),
        React.createElement(reactstrap_1.ListGroup, null, plants.map(function (plant) {
            return React.createElement(SimplePlant_1.default, { name: plant.name, age: plant.age });
        })),
        React.createElement("div", null,
            React.createElement(reactstrap_1.Button, { outline: true, color: "primary" }, "My Gardens"),
            ' ',
            React.createElement(reactstrap_1.Button, { color: "success" }, "success"),
            ' ')));
}
exports.default = Plants;
//# sourceMappingURL=plants.js.map