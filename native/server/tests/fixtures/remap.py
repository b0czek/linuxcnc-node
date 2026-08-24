import emccanon
from interpreter import INTERP_OK


def preview_remap(self, **words):
    # Re-entering the interpreter and calling emccanon directly are the two
    # supported ways Python remaps emit preview motion. _task/self.task must be
    # zero for an offline preview interpreter.
    if self.task != 0:
        return INTERP_OK

    self.execute("G1 X12 Y3 F120")
    emccanon.STRAIGHT_FEED(405, 20.0, 4.0, 0.0, 0.0, 0.0,
                           0.0, 0.0, 0.0, 0.0)
    return INTERP_OK
