#!/usr/bin/python3
import json
import os


def read_json(path):
    with open(path, 'r') as f:
        raw = f.read()
        return json.loads(
            raw[raw.index('{'):]
        )


def export_json(path, obj, as_js=False, var_name="pokedex"):
    if as_js:
        with open(path, 'w') as f:
            out = json.dumps(obj, cls=CompactJSONEncoder, indent=4)
            f.write(f"export const {var_name} = " + out)
    else:
        with open(path, 'w') as f:
            f.write(json.dumps(obj, cls=CompactJSONEncoder, indent=4))


class CompactJSONEncoder(json.JSONEncoder):
    def __init__(self, *args, **kwargs):
        if kwargs.get("indent") is None:
            kwargs["indent"] = 4
        super().__init__(*args, **kwargs)
        self.indentation_level = 0

    def encode(self, o):
        if isinstance(o, list):
            return self._encode_list(o)
        if isinstance(o, dict):
            return self._encode_object(o)
        return json.dumps(
            o,
            skipkeys=self.skipkeys,
            ensure_ascii=self.ensure_ascii,
            check_circular=self.check_circular,
            allow_nan=self.allow_nan,
            sort_keys=self.sort_keys,
            indent=self.indent,
            separators=(self.item_separator, self.key_separator),
            default=self.default if hasattr(self, "default") else None,
        )
    
    def _encode_object(self, o):
        if not o:
            return "{}"
        elif self._put_dict_on_single_line(o):
            contents = ", ".join(f"{json.dumps(k)}: {self.encode(v)}" for k, v in o.items())
            return f"{{{contents}}}"

        self.indentation_level += 1
        output = [
            f"{self.indent_str}{json.dumps(k)}: {self.encode(v)}" for k, v in o.items()
        ]

        self.indentation_level -= 1
        return "{\n" + ",\n".join(output) + "\n" + self.indent_str + "}"

    def _put_dict_on_single_line(self, o):
        flat_dict = not any(isinstance(x, dict) or isinstance(x, list) for x in o.values())
        return (
            len(o) == 3 and
            flat_dict
        )

    def _encode_list(self, o):
        if self._put_list_on_single_line(o):
            return "[" + ", ".join(self.encode(el) for el in o) + "]"
        elif not o:
            return "[]"
        self.indentation_level += 1
        output = [self.indent_str + self.encode(el) for el in o]
        self.indentation_level -= 1
        return "[\n" + ",\n".join(output) + "\n" + self.indent_str + "]"

    def iterencode(self, o, **kwargs):
        return self.encode(o)

    def _put_list_on_single_line(self, o):
        return (
            len(o) == 2 and
            isinstance(o[0], int) and
            isinstance(o[1], str)
        )

    @property
    def indent_str(self) -> str:
        if isinstance(self.indent, int):
            return " " * (self.indentation_level * self.indent)
        elif isinstance(self.indent, str):
            return self.indentation_level * self.indent
        else:
            raise ValueError(
                f"indent must either be of type int or str (is: {type(self.indent)})"
            )


if __name__ == "__main__":
    filename_lookup = {
        "Yellow": "yellow.js",
        "Red and Blue": "red_blue.js",
        "Gold and Silver": "gold_silver.js",
        "Crystal": "crystal.js",
        "Ruby and Sapphire": "ruby_sapphire.js",
        "Emerald": "emerald.js",
        "FireRed and LeafGreen": "firered_leafgreen.js",
        "Diamond and Pearl": "diamond_pearl.js",
        "Platinum": "platinum.js",
        "HeartGold and SoulSilver": "heartgold_soulsilver.js",
    }

    full_pokedex = read_json('pokedex.js')

    for cur_dex in full_pokedex:
        if cur_dex not in filename_lookup:
            raise ValueError(f"Need filename_lookup entry for new pokemon game: {cur_dex}")
        
        export_json(
            os.path.join("pokedex", filename_lookup[cur_dex]),
            full_pokedex[cur_dex],
            as_js=True
        )

