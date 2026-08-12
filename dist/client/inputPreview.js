import { CONFIG } from "../shared/config.js";
import { clamp, normalizeAngle } from "../shared/types.js";
export function previewLocalSnake(snake, targetAngle, boost) {
    if (!snake.body.length)
        return snake;
    const seconds = CONFIG.LOCAL_INPUT_PREVIEW_MS / 1000;
    const delta = normalizeAngle(targetAngle - snake.angle);
    const turn = clamp(delta, -CONFIG.TURN_RATE * seconds, CONFIG.TURN_RATE * seconds);
    const angle = normalizeAngle(snake.angle + turn);
    const distance = (boost ? CONFIG.BOOST_SPEED : CONFIG.BASE_SPEED) * seconds;
    const head = snake.body[0];
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const body = snake.body.map((point, index) => {
        const weight = Math.exp(-index / 3.2);
        const bend = turn * weight * .72;
        const bx = point.x - head.x, by = point.y - head.y;
        const bc = Math.cos(bend), bs = Math.sin(bend);
        const rx = bx * bc - by * bs;
        const ry = bx * bs + by * bc;
        const lead = distance * weight;
        return { x: head.x + rx + cos * lead, y: head.y + ry + sin * lead };
    });
    return { ...snake, angle, boost, body };
}
