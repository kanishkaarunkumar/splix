class DomainError(Exception):
    def __init__(self, code: str, message: str, fields: dict[str, str] | None = None):
        super().__init__(message)
        self.code = code
        self.fields = fields or {}
